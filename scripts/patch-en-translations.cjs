const fs = require('fs');
const en = require('./src/locales/en.json');

const patch = {
  common: { proFeature: 'Pro Feature' },
  designer: {
    intelligence: {
      analyze: 'Analyze Diagram',
      suggest: 'Suggest Layout',
      optimize: 'Optimize',
      generating: 'Generating...'
    },
    flowchart: {
      importFailed: 'Import failed: invalid JSON or unsupported format',
      invalidJson: 'Invalid JSON: {{reason}}',
      commandPaletteHint: 'Press {{mod}}+K or / to open command palette',
      commandDisabled: 'Not available',
      undo: {
        title: 'Undo supported', action: 'Undo', done: 'Undone',
        desc: {
          paste: 'Paste: {{nodes}} nodes, {{edges}} edges',
          cut: 'Cut: {{nodes}} nodes, {{edges}} edges',
          delete: 'Delete: {{nodes}} nodes, {{edges}} edges',
          duplicate: 'Duplicate: {{nodes}} nodes',
          group: 'Group: {{nodes}} nodes',
          ungroup: 'Ungroup: {{groups}} groups',
          layout: 'Auto layout: {{direction}} / {{algorithm}}'
        }
      },
      commandCategory: { general:'General', view:'View', file:'File', action:'Action', nodes:'Nodes', edges:'Edges' },
      commands: {
        toggleGrid:'Toggle Grid', toggleSmartRouting:'Toggle Smart Routing',
        undo:'Undo', redo:'Redo', copy:'Copy', paste:'Paste', cut:'Cut',
        deleteSelected:'Delete Selected', deleteShortcut:'Del / Backspace',
        duplicate:'Duplicate', selectAll:'Select All', group:'Group', ungroup:'Ungroup',
        autoLayoutTB:'Auto Layout (Top-Bottom)', autoLayoutLR:'Auto Layout (Left-Right)'
      },
      group: { defaultLabel:'New Group', defaultDescription:'Group selected items' },
      toast: {
        nothingToCopy:'Nothing to copy', nothingToPaste:'Nothing to paste',
        nothingToCut:'Nothing to cut', nothingToDuplicate:'No nodes to duplicate',
        needTwoNodesToGroup:'Select at least two nodes to group',
        groupSameLevel:'Select nodes at the same level to group',
        nothingToUngroup:'No groups to ungroup',
        copied:'Copied: {{nodes}} nodes, {{edges}} edges',
        pasted:'Pasted: {{nodes}} nodes, {{edges}} edges',
        cut:'Cut: {{nodes}} nodes, {{edges}} edges',
        deleted:'Deleted: {{nodes}} nodes, {{edges}} edges',
        duplicated:'Duplicated: {{nodes}} nodes',
        grouped:'Grouped: {{nodes}} nodes',
        ungrouped:'Ungrouped: {{groups}} groups',
        edgeReversed:'Edge direction reversed',
        waypointsReset:'Edge path reset',
        convertedToEditable:'Converted to editable edge'
      },
      onboarding: {
        title:'Quick Start', openPalette:'Open command palette ({{mod}}+K)', dismiss:'Do not show again',
        step: {
          drag:'Drag components from the left panel to canvas',
          connect:'Drag from node handles to connect; drop on empty space to add node',
          palette:'Use {{mod}}+K or / to search and run commands',
          pan:'Hold Space and drag to pan the canvas'
        }
      },
      layout: {
        tooltip:'Auto Layout', dagreTB:'Dagre Vertical (TB)', dagreLR:'Dagre Horizontal (LR)',
        elkTB:'ELK Vertical (Layered)', elkLR:'ELK Horizontal (Layered)',
        treeGroup:'Tree Layout', treeTB:'\u2195 Tree (Top\u2192Bottom)', treeLR:'\u2194 Tree (Left\u2192Right)',
        forceGroup:'Force Directed', force:'\u2299 Force',
        domainGroup:'Domain-Aware Layout',
        domainDagreLR:'\u25c8 DomainDagre (Left\u2192Right)',
        domainDagreTB:'\u25c8 DomainDagre (Top\u2192Bottom) (Default)',
        domainVertical:'\u25a5 DomainVertical (Top\u2192Bottom)',
        domainHorizontal:'\u25a6 DomainHorizontal (Left\u2192Right)',
        nodeLayoutGroup:'Node Arrangement',
        nodeFlow:'\u25b7 Flow', nodeGrid:'\u229e Grid',
        nodeHorizontal:'\u229f Horizontal', nodeVertical:'\u229e Vertical',
        nodeDagre:'\u25c8 Dagre Layered (Default)'
      },
      newNode:'New Node', nodeAdded:'Added {{type}}',
      edgeNodeInserted:'Inserted new node at edge midpoint',
      clearCanvas: { title:'Clear Canvas', content:'Are you sure you want to clear the canvas? This cannot be undone.', ok:'OK', cancel:'Cancel' },
      import: {
        standardSuccess:'Imported successfully ({{count}} nodes)',
        reloading:'Reloading view theme and layout...',
        rfSuccess:'Imported {{nodes}} nodes and {{edges}} edges',
        invalidFormat:'Invalid data format',
        jsonFailed:'JSON import failed: {{message}}',
        mermaidSuccess:'Mermaid text imported',
        mermaidLayout:'Tip: click "Smart Layout" to organize nodes',
        mermaidFailed:'Mermaid parse failed',
        reverseSuccess:'Canvas restored from [{{filename}}]'
      },
      mermaidCopied:'Mermaid code copied to clipboard',
      templateApplied:'Template applied',
      smartLayout:'Recommended: {{reason}} (confidence {{confidence}}%)',
      optimize:'Optimized: resolved {{overlaps}} overlaps, aligned {{nodes}} nodes.',
      noHistory:'No history to compare',
      settingsNotAvailable:'Settings panel not available in standalone mode. Open from main view or press Ctrl+Shift+,',
      mindMapCenter:'Central Topic', summaryLabel:'Summary',
      pluginMissing:'Plugin missing [{{type}}]', relationshipEdgeLabel:'Related'
    }
  },
  aiChat: {
    status: {
      nodeAdded:'Node added: {{label}}', nodesDeleted:'{{count}} node(s) deleted',
      connected:'Connected: {{source}} \u2192 {{target}}', layoutApplied:'Layout applied: {{type}}',
      groupCreated:'Group created: {{label}}', analyzing:'Analyzing diagram...',
      nodeNotFound:'Node not found: {{label}}', noMatchFound:'No matching node: {{keyword}}',
      savingTo:'Saving to {{target}}...', saveSuccess:'Saved successfully',
      smartLayout:'Smart layout applied', smartGroup:'Smart grouping applied',
      resetSuccess:'Conversation cleared', connectFormat:'Format: /connect NodeA NodeB',
      cmdReset:'/clear \u2014 clear conversation', cmdGuide:'/help \u2014 show help',
      cmdPresent:'/present \u2014 presentation mode', cmdExit:'/exit \u2014 exit presentation',
      cmdAnimate:'/animate \u2014 toggle animation', cmdFlow:'/flow \u2014 highlight main flow',
      cmdStyle:'/style [name] \u2014 apply style', cmdAnalyze:'/analyze \u2014 analyze diagram',
      cmdSuggest:'/suggest \u2014 suggest improvements', cmdDoc:'/doc \u2014 generate docs',
      voiceBeta:'\uD83C\uDFA4 Voice input (Beta)',
      cmdBrainstormOnlyMindmap:'/brainstorm \u2014 mind map only'
    },
    help: { title:'Command Reference', footer:'Type / for quick command access' }
  },
  plugins: {
    mindmap: {
      direction: { BT:'\u2191 Bottom Up', FISHBONE:'\uD83D\uDEB8 Fishbone' },
      actions: {
        copyBranch:'Copy Branch', pasteBranch:'Paste Branch',
        exportMd:'Export Markdown', exportMdSuccess:'Markdown exported',
        addChild:'Add Child Node', addSibling:'Add Sibling Node',
        deleteNode:'Delete Node', collapse:'Collapse Branch', expand:'Expand Branch'
      },
      actionBar: {
        addSibling:'Add Sibling', addChild:'Add Child',
        addRelationship:'Add Relationship', addSummary:'Add Summary',
        addBoundary:'Add Boundary', copyBranch:'Copy Branch',
        exportMd:'Export MD', beautify:'Style Panel'
      },
      beautify: {
        title:'Style', layout:'Layout Direction', shape:'Node Shape',
        shapeUnderline:'Underline', shapePill:'Pill', shapeBox:'Box',
        pathStyle:'Branch Style', branchColor:'Branch Color',
        urlLink:'URL Link', urlPlaceholder:'https://',
        priority:'Priority', priorityNone:'None', priorityLow:'Low',
        priorityMedium:'Medium', priorityHigh:'High',
        progress:'Progress', progressDone:'Done', hint:'Click node to open panel'
      },
      outline: { title:'Outline', editHint:'Click to edit', noNodes:'No nodes yet' },
      shortcuts: {
        copyBranch:'Copy Branch', pasteBranch:'Paste Branch',
        exportMd:'Export Markdown', addChild:'Add Child (Tab)',
        addSibling:'Add Sibling (Enter)', delete:'Delete (Backspace)'
      }
    }
  },
  pluginMarketplace: {
    subtitle:'Extend your diagramming with powerful plugins',
    discoverMore:'Discover More', tabAll:'All', tabCore:'Core',
    tabProductivity:'Productivity', tabInstalled:'Installed',
    searchPlaceholder:'Search plugins...'
  },
  storageConfig: {
    pageTitle:'Storage Configuration',
    pageDescription:'Configure your cloud storage provider for diagram persistence.',
    saveFail:'Save failed, please retry',
    testFail: {
      title:'Connection Failed', corsTitle:'CORS Configuration Required',
      corsDesc:'Add the following CORS rules to your S3 bucket:',
      corsOrigin:'AllowedOrigins', corsMethods:'AllowedMethods',
      genericTitle:'Connection Error',
      check1:'Verify endpoint URL and bucket name',
      check2:'Check Access Key ID and Secret Access Key',
      check3:'Ensure bucket exists and region is correct',
      check4:'Confirm CORS rules allow this origin',
      errorDetail:'Error detail: {{message}}'
    },
    form: {
      endpointLabel:'Endpoint URL', endpointRequired:'Endpoint URL is required',
      bucketLabel:'Bucket Name', bucketRequired:'Bucket name is required',
      regionLabel:'Region', regionRequired:'Region is required',
      forcePathStyleLabel:'Force Path Style',
      forcePathStyleTooltip:'Enable for MinIO or non-AWS S3-compatible services',
      accessKeyRequired:'Access Key ID is required',
      secretKeyRequired:'Secret Access Key is required',
      saveBtn:'Save Configuration', testBtn:'Test Connection'
    },
    notes: {
      title:'Notes',
      cors:'Ensure your S3 bucket has CORS configured to allow requests from this origin.',
      security:'Credentials are stored locally and never transmitted to our servers.'
    }
  },
  aiConfig: {
    currentActive:'Currently active: {{name}}', selectProvider:'Select a provider',
    newProviderName:'New Provider', saveSuccess:'Configuration saved locally',
    saveSuccessCloud:'Configuration saved to cloud',
    cloudSyncFail:'Cloud sync failed, saved locally',
    switchedTo:'Switched to: {{name}}', noModelId:'Model ID cannot be empty',
    modelAdded:'Model added: {{id}}',
    testFillRequired:'Please fill in API Key and Base URL before testing',
    testFailHtml:'Connection failed', testFail:'Connection failed: {{message}}'
  },
  upgrade: {
    featureContext:'Upgrade to Pro to unlock this feature',
    subtitle:'Unlock the full power of Vizly',
    features: { pdf:'Multi-page PDF export', collab:'Real-time collaboration', history:'Version history', ai:'Unlimited AI requests' },
    later:'Maybe later', subscribe:'Subscribe to Pro',
    loginFirst:'Please log in before upgrading',
    checkoutFail:'Failed to open checkout, please retry',
    gatewayFail:'Payment gateway error, please contact support',
    unknownError:'Unknown error, please retry',
    unknownResponse:'Unexpected server response, please retry',
    statusError:'Failed to verify upgrade status'
  }
};

function deepPatch(target, source) {
  for (const k of Object.keys(source)) {
    if (!(k in target)) {
      target[k] = source[k];
    } else if (typeof source[k] === 'object' && source[k] !== null && typeof target[k] === 'object') {
      deepPatch(target[k], source[k]);
    }
  }
}

deepPatch(en, patch);
fs.writeFileSync('./src/locales/en.json', JSON.stringify(en, null, 4), 'utf8');
console.log('Done.');
