import { Node, Edge } from '@xyflow/react';
import { analyzeDiagram, type AnalysisEdge, type AnalysisNode } from '../../utils/diagramAnalyzer';
import i18n from '@/i18n';

export interface DocGenOptions {
    title?: string;
    author?: string;
    includeAnalysis?: boolean;
}

export class DocGeneratorService {
    private static instance: DocGeneratorService;
    private constructor() {}

    public static getInstance(): DocGeneratorService {
        if (!DocGeneratorService.instance) {
            DocGeneratorService.instance = new DocGeneratorService();
        }
        return DocGeneratorService.instance;
    }

    /**
     * Generate a structured Markdown document from diagram data
     */
    public generateMarkdown(nodes: Node[], edges: Edge[], options: DocGenOptions = {}): string {
        const { title = i18n.t('services.docGen.title'), author = 'Vizly AI', includeAnalysis = true } = options;
        
        let md = `# ${title}\n\n`;
        md += `> **${i18n.t('services.docGen.generatedOn')}:** ${new Date().toLocaleString()}\n`;
        md += `> **${i18n.t('services.docGen.author')}:** ${author}\n\n`;

        // 1. System Overview
        md += `## ${i18n.t('services.docGen.overview')}\n\n`;
        const leafNodes = nodes.filter(n => !['group', 'subGroup', 'titleGroup'].includes(n.type || ''));
        const containers = nodes.filter(n => ['group', 'subGroup', 'titleGroup'].includes(n.type || ''));
        
        md += i18n.t('services.docGen.overviewDesc', { nodeCount: leafNodes.length, containerCount: containers.length }) + '\n\n';

        if (includeAnalysis) {
            const analysis = analyzeDiagram(
                nodes as unknown as AnalysisNode[],
                edges as unknown as AnalysisEdge[],
            );
            md += `### ${i18n.t('services.docGen.healthSummary')}\n\n`;
            md += analysis.summary.split('\n').map(line => `- ${line}`).join('\n') + '\n\n';
            
            const criticalIssues = analysis.issues.filter(i => i.severity === 'error' || i.severity === 'warning');
            if (criticalIssues.length > 0) {
                md += `> [!WARNING]\n`;
                md += `> **${i18n.t('services.docGen.risks')}:**\n`;
                criticalIssues.forEach(issue => {
                    md += `> - ${issue.message}\n`;
                });
                md += `\n`;
            }
        }

        // 2. Component Hierarchy
        md += `## ${i18n.t('services.docGen.hierarchy')}\n\n`;
        
        // Group by Domain
        const domains: Record<string, string> = {
            'ch': 'Channel / User Interface 📱',
            'fe': 'Frontend / API Gateway 🌐',
            'mid': 'Middleware / Business Logic ⚙️',
            'data': 'Data Tier / Storage 🗄️',
            'unknown': 'Uncategorized Components'
        };

        const nodesByDomain: Record<string, Node[]> = {
            'ch': [], 'fe': [], 'mid': [], 'data': [], 'unknown': []
        };

        leafNodes.forEach(node => {
            const domain = (node.data?.domainClass as string) || 'unknown';
            if (nodesByDomain[domain]) {
                nodesByDomain[domain].push(node);
            } else {
                nodesByDomain['unknown'].push(node);
            }
        });

        Object.entries(domains).forEach(([key, domainName]) => {
            const domainNodes = nodesByDomain[key];
            if (domainNodes && domainNodes.length > 0) {
                md += `### 2.${Object.keys(domains).indexOf(key) + 1} ${domainName}\n\n`;
                md += `| Component | Description | Type | Status |\n`;
                md += `| :--- | :--- | :--- | :--- |\n`;
                domainNodes.forEach(n => {
                    const label = n.data?.label || n.id;
                    const desc = String(n.data?.description || 'No description provided').replace(/\n/g, '<br/>');
                    const type = n.data?.type || n.type || 'Generic';
                    const status = n.data?.status || 'normal';
                    md += `| **${label}** | ${desc} | \`${type}\` | ${status} |\n`;
                });
                md += `\n`;
            }
        });

        // 3. Service Interactions
        md += `## ${i18n.t('services.docGen.interactions')}\n\n`;
        if (edges.length === 0) {
            md += i18n.t('services.docGen.noInteractions') + '\n\n';
        } else {
            md += i18n.t('services.docGen.interactionDesc') + '\n\n';
            md += `| Source Component | Target Component | Interaction / Protocol | Status |\n`;
            md += `| :--- | :--- | :--- | :--- |\n`;
            edges.forEach(e => {
                const source = nodes.find(n => n.id === e.source)?.data?.label || e.source;
                const target = nodes.find(n => n.id === e.target)?.data?.label || e.target;
                const label = typeof e.label === 'string' ? e.label : 'Depends on';
                const animated = e.animated ? '🔄 Active Flow' : '-';
                md += `| ${source} | ${target} | ${label} | ${animated} |\n`;
            });
            md += `\n`;
        }

        // 4. Infrastructure Mapping (Containers)
        if (containers.length > 0) {
            md += `## ${i18n.t('services.docGen.containers')}\n\n`;
            containers.forEach(container => {
                const label = container.data?.label || container.id;
                const children = leafNodes.filter(n => n.parentId === container.id);
                if (children.length > 0) {
                    md += i18n.t('services.docGen.containerDesc', { label: label, children: children.map(c => `\`${c.data?.label || c.id}\``).join(', ') }) + '\n';
                }
            });
            md += `\n`;
        }

        md += `---\n${i18n.t('services.docGen.footer')}\n`;

        return md;
    }
}
