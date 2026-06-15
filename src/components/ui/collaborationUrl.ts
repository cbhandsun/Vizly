import {
    normalizeCollaborationDiagramId,
    normalizeCollaborationRoomName,
} from '../diagrams/collaboration/collaborationSecurity';

type LocationLike = Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>;

const getParamFromSearchOrHash = (location: LocationLike, name: string): string | null => {
    const directValue = new URLSearchParams(location.search).get(name);
    if (directValue) return directValue;

    const hashQueryStart = location.hash.indexOf('?');
    if (hashQueryStart < 0) return null;

    return new URLSearchParams(location.hash.slice(hashQueryStart + 1)).get(name);
};

export const buildCollaborationShareUrl = (
    location: LocationLike,
    roomName: string,
    fallbackDiagram = 'domain-model'
): string => {
    const url = new URL(location.pathname || '/', location.origin);
    const diagram = normalizeCollaborationDiagramId(
        getParamFromSearchOrHash(location, 'diagram'),
        fallbackDiagram
    );

    url.searchParams.set('diagram', diagram);
    url.searchParams.set('room', normalizeCollaborationRoomName(roomName));

    return url.toString();
};
