import { Fragment } from 'react';
import { Handle, Position } from '@xyflow/react';

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

/** Routing may attach either endpoint role on any side, including collapsed proxies. */
export function GroupNodeHandles({ className, isConnectable = true }: {
  className: string;
  isConnectable?: boolean;
}) {
  return SIDES.map(side => (
    <Fragment key={side}>
      <Handle type="source" position={side} id={side} className={className}
        isConnectable={isConnectable}
        isConnectableStart={isConnectable} isConnectableEnd={isConnectable}
        style={isConnectable ? undefined : { pointerEvents: 'none' }} />
      <Handle type="target" position={side} id={side} className={className}
        isConnectable={isConnectable}
        isConnectableStart={false} isConnectableEnd={isConnectable}
        style={{ opacity: 0, pointerEvents: 'none' }} />
    </Fragment>
  ));
}
