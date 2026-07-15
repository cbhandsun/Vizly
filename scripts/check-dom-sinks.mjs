import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const gitFiles = (args) => execFileSync('git', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

// Match the source-size gate: local verification must cover new modules before
// they are staged, while ignored build output remains outside the scan.
const sourceFiles = [...new Set([
  ...gitFiles(['ls-files', '--', 'src']),
  ...gitFiles(['ls-files', '--others', '--exclude-standard', '--', 'src']),
])]
  .filter(file => /\.(?:tsx?|jsx?)$/i.test(file) && existsSync(file))
  .sort();

const failures = [];

const scriptKindForFile = (file) => {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX;
  if (/\.ts$/i.test(file)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
};

const lineForNode = (sourceFile, node) => {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
};

const isIdentifierNamedSafeHtml = (node) => {
  return ts.isIdentifier(node) && /^safe[A-Za-z0-9_]*$/.test(node.text);
};

const isSafeHtmlPropertyAccess = (node) => {
  return ts.isPropertyAccessExpression(node) && /^safe[A-Za-z0-9_]*$/.test(node.name.text);
};

const isSanitizerCall = (node) => {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return (
    (ts.isIdentifier(callee) && /^sanitize[A-Za-z0-9_]*$/.test(callee.text)) ||
    (ts.isPropertyAccessExpression(callee) && /^sanitize[A-Za-z0-9_]*$/.test(callee.name.text))
  );
};

const isAllowedHtmlExpression = (node) => (
  isSanitizerCall(node) ||
  isIdentifierNamedSafeHtml(node) ||
  isSafeHtmlPropertyAccess(node)
);

const getDangerouslySetInnerHtmlExpression = (attribute) => {
  if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer)) return null;
  const objectExpression = attribute.initializer.expression;
  if (!objectExpression || !ts.isObjectLiteralExpression(objectExpression)) return null;

  const htmlProperty = objectExpression.properties.find((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    const name = property.name;
    return (
      (ts.isIdentifier(name) && name.text === '__html') ||
      (ts.isStringLiteral(name) && name.text === '__html')
    );
  });

  return htmlProperty && ts.isPropertyAssignment(htmlProperty)
    ? htmlProperty.initializer
    : null;
};

const checkSourceFile = (file, sourceText) => {
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, scriptKindForFile(file));

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile).toLowerCase();

      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || attribute.name.text !== 'dangerouslySetInnerHTML') continue;

        if (tagName === 'style') {
          failures.push(`${file}:${lineForNode(sourceFile, attribute)} unsafe <style dangerouslySetInnerHTML>`);
          continue;
        }

        const htmlExpression = getDangerouslySetInnerHtmlExpression(attribute);
        if (!htmlExpression || !isAllowedHtmlExpression(htmlExpression)) {
          failures.push(`${file}:${lineForNode(sourceFile, attribute)} unguarded dangerouslySetInnerHTML`);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
};

for (const file of sourceFiles) {
  checkSourceFile(file, readFileSync(file, 'utf8'));
}

if (failures.length > 0) {
  console.error([
    `Found ${failures.length} unsafe DOM HTML sink(s):`,
    ...failures.map(entry => `  - ${entry}`),
    '',
    'Use a stylesheet, CSS variables, inline style props, or textContent-based style injection instead of <style dangerouslySetInnerHTML>.',
    'For HTML sinks, pass only sanitize*() results or clearly named safe* values to dangerouslySetInnerHTML.',
  ].join('\n'));
  process.exit(1);
}

console.log('No unsafe DOM HTML sinks found.');
