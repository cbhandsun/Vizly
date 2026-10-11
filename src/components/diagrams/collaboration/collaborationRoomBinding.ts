/** Room names are identities, not display text: reject aliases and truncation. */
export const resolveCollaborationRoomBinding = (diagramId: unknown, requestedRoom: unknown) => {
    if (typeof diagramId !== 'string' || diagramId.length < 1 || diagramId.length > 117
        || /[^A-Za-z0-9_-]/.test(diagramId)) {
        return { roomName: '', valid: false };
    }
    const roomName = `vizly-room-${diagramId}`;
    return { roomName, valid: requestedRoom === null || requestedRoom === undefined || requestedRoom === roomName };
};
