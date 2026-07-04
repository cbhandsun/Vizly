import {
    normalizeCollaborationDiagramId,
    normalizeCollaborationRoomName,
} from '../diagrams/collaboration/collaborationSecurity';
import { coerceDiagramId, getQueryOrHashParamFromLocation } from '@/core/utils/inputBoundary';

type LocationLike = Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>;

export const buildCollaborationShareUrl = (
    location: LocationLike,
    roomName: string,
    fallbackDiagram = 'domain-model'
): string => {
    const url = new URL(location.pathname || '/', location.origin);
    const diagram = normalizeCollaborationDiagramId(
        coerceDiagramId(getQueryOrHashParamFromLocation(location, 'diagram') || fallbackDiagram, fallbackDiagram),
        fallbackDiagram
    );

    url.searchParams.set('diagram', diagram);
    url.searchParams.set('room', normalizeCollaborationRoomName(roomName));

    return url.toString();
};
