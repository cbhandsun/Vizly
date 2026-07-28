export const readVisibleDisplayRoutingNodeRect = (nodeId) => {
  if (typeof nodeId !== 'string' || nodeId.length === 0 || nodeId.length > 500) return null;
  const element = [...document.querySelectorAll('.react-flow__node[data-id]')]
    .find(candidate => candidate.getAttribute('data-id') === nodeId);
  const pane = document.querySelector('.react-flow__pane');
  if (!element || !pane) return null;
  const bounds = element.getBoundingClientRect();
  const paneBounds = pane.getBoundingClientRect();
  const values = [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    paneBounds.left,
    paneBounds.top,
    paneBounds.right,
    paneBounds.bottom,
  ];
  if (!values.every(Number.isFinite) || bounds.width <= 1 || bounds.height <= 1) return null;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  if (
    centerX < paneBounds.left
    || centerX > paneBounds.right
    || centerY < paneBounds.top
    || centerY > paneBounds.bottom
  ) return null;
  const canReceivePointer = document.elementsFromPoint(centerX, centerY)
    .some(candidate => candidate === element || element.contains(candidate));
  return canReceivePointer
    ? {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
    : null;
};

export const readDisplayRoutingNodePanGesture = (nodeId) => {
  if (typeof nodeId !== 'string' || nodeId.length === 0 || nodeId.length > 500) return null;
  const element = [...document.querySelectorAll('.react-flow__node[data-id]')]
    .find(candidate => candidate.getAttribute('data-id') === nodeId);
  const pane = document.querySelector('.react-flow__pane');
  if (!element || !pane) return null;
  const bounds = element.getBoundingClientRect();
  const paneBounds = pane.getBoundingClientRect();
  const values = [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    paneBounds.left,
    paneBounds.top,
    paneBounds.right,
    paneBounds.bottom,
    paneBounds.width,
    paneBounds.height,
  ];
  if (!values.every(Number.isFinite) || paneBounds.width < 20 || paneBounds.height < 20) return null;
  const samples = [
    [0.5, 0.5],
    [0.15, 0.15],
    [0.85, 0.15],
    [0.15, 0.85],
    [0.85, 0.85],
    [0.5, 0.15],
    [0.5, 0.85],
  ];
  const start = samples
    .map(([xRatio, yRatio]) => ({
      x: paneBounds.left + paneBounds.width * xRatio,
      y: paneBounds.top + paneBounds.height * yRatio,
    }))
    .find(point => document.elementFromPoint(point.x, point.y) === pane);
  if (!start) return null;
  const desiredX = paneBounds.left + paneBounds.width / 2;
  const desiredY = paneBounds.top + paneBounds.height / 2;
  const nodeCenterX = bounds.x + bounds.width / 2;
  const nodeCenterY = bounds.y + bounds.height / 2;
  const inset = 8;
  const deltaX = Math.max(
    paneBounds.left + inset - start.x,
    Math.min(paneBounds.right - inset - start.x, desiredX - nodeCenterX),
  );
  const deltaY = Math.max(
    paneBounds.top + inset - start.y,
    Math.min(paneBounds.bottom - inset - start.y, desiredY - nodeCenterY),
  );
  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return null;
  return {
    startX: start.x,
    startY: start.y,
    endX: start.x + deltaX,
    endY: start.y + deltaY,
  };
};
