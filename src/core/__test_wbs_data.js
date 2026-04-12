const hierarchicalData = {
    nodes: [
        {
            id: 'n1',
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: { label: '🌟 Alpha Project', type: 'summary', isExpanded: true }
        },
        {
            id: 'n2',
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: { label: 'Phase 1: Planning', type: 'phase', parentId: 'n1', date: '2026-04-01', endDate: '2026-04-10', progress: 100 }
        },
        {
            id: 'n3',
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: { label: 'Phase 2: Execution', type: 'summary', parentId: 'n1', isExpanded: true }
        },
        {
            id: 'n4',
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: { label: 'Frontend Dev', type: 'phase', parentId: 'n3', date: '2026-04-12', endDate: '2026-04-20', progress: 40 }
        },
        {
            id: 'n5',
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: { label: 'Backend API', type: 'phase', parentId: 'n3', date: '2026-04-15', endDate: '2026-04-25', progress: 20 }
        },
        {
            id: 'n6',
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: { label: 'Beta Release', type: 'milestone', parentId: 'n3', date: '2026-04-26', endDate: '2026-04-26' }
        },
        {
            id: 'n7',
            type: 'timelineNode',
            position: { x: 0, y: 0 },
            data: { label: 'Phase 3: Launch', type: 'event', parentId: 'n1', date: '2026-05-01', endDate: '2026-05-15', progress: 0 }
        }
    ],
    edges: [
        { id: 'e1', source: 'n2', target: 'n4', type: 'smoothstep' },
        { id: 'e2', source: 'n4', target: 'n5', type: 'smoothstep' },
        { id: 'e3', source: 'n5', target: 'n6', type: 'smoothstep' }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
};
localStorage.setItem('flowchart-diagram-timeline-diagram-v2', JSON.stringify(hierarchicalData));
console.log('Injected hierarchical data.');
