export type {
  EdgeTerminalHandleChangeOptions as DisplayTerminalHandleChangeOptions,
  EdgeTerminalRole as DisplayTerminalRole,
  EdgeTerminalSide as DisplayTerminalSide,
} from '../../routing/utils/edgeTerminalPolicy';

export {
  edgeTerminalHandleChangeIsAllowed as displayTerminalHandleChangeIsAllowed,
  edgeTerminalPositionIsFixed as displayTerminalPositionIsFixed,
  edgeTerminalSideCanSwitch as displayTerminalSideCanSwitch,
  edgeTerminalSideIsFixed as displayTerminalSideIsFixed,
  readEdgeTerminalPolicy as readDisplayTerminalPolicy,
  resolveEdgeTerminalHandleForSide as resolveDisplayTerminalHandleForSide,
} from '../../routing/utils/edgeTerminalPolicy';
