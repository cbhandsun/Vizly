/**
 * Warehouse Dimensions and Constants
 * Units are meters (approximate)
 */
export const WAREHOUSE = {
    WIDTH: 300,
    DEPTH: 160,
    HEIGHT: 30,
    WALL_THICKNESS: 1,

    // X Positions (assuming center is 0)
    LEFT_EDGE: -150,
    RIGHT_EDGE: 150,
    TOP_EDGE: -80,
    BOTTOM_EDGE: 80,

    // Zones (X ranges)
    DOCKS_LEFT_X: -145,
    DOCKS_RIGHT_X: 145,
    INBOUND_AREA_X: -130,
    HIGH_BAY_X: [-115, -65],
    ASRS_X: [-50, 20],
    MEZZANINE_X: [40, 90],
    CONVEYOR_X: [100, 115],
    SHIPPING_AREA_X: [120, 140],

    // Support Area (Z range at bottom)
    SUPPORT_Z: [55, 80],

    // Colors
    COLORS: {
        FLOOR: '#d0d0d0',
        WALLS: '#ecf0f1',
        RACKS_HIGH_BAY: '#2c3e50',
        RACKS_MEZZANINE: '#7f8c8d',
        ASRS_FRAME: '#34495e',
        CONVEYOR: '#95a5a6',
        DOCK_DOOR: '#3498db',
        ZONE_LABELS: '#2c3e50',
    }
};
