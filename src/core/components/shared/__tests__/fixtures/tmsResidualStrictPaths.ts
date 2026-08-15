export const tmsResidualStrictPaths: Record<string, Array<{ x: number; y: number }>> = {
  'edge-cost-bi': [
    { x: 1682, y: 2849 }, { x: 1682, y: 2921 }, { x: 1248, y: 2921 }, { x: 1248, y: 3007 },
  ],
  'edge-driver-tms-execution': [
    { x: 1451, y: 1187 }, { x: 1451, y: 1255 }, { x: 1533, y: 1255 },
    { x: 1533, y: 1913 }, { x: 1461, y: 1913 }, { x: 1461, y: 1985 },
  ],
  'edge-fleet-tms-planning': [
    { x: 971, y: 1187 }, { x: 971, y: 1259 }, { x: 1466, y: 1259 }, { x: 1466, y: 1707 },
  ],
  'edge-frp-wms-integration': [
    { x: 1627, y: 571 }, { x: 1555, y: 571 }, { x: 1555, y: 1010 }, { x: 649, y: 1010 },
  ],
  'edge-gps-tms-execution': [
    { x: 1244, y: 620 }, { x: 1244, y: 994 }, { x: 1556, y: 994 },
    { x: 1556, y: 1913 }, { x: 1461, y: 1913 }, { x: 1461, y: 1985 },
  ],
  'edge-oms-wms-inbound': [
    { x: 322, y: 631 }, { x: 322, y: 720 }, { x: 116, y: 720 }, { x: 116, y: 961 },
  ],
  'edge-oms-wms-outbound': [
    { x: 322, y: 631 }, { x: 322, y: 732 }, { x: 240, y: 732 },
    { x: 240, y: 1145 }, { x: 116, y: 1145 }, { x: 116, y: 1217 },
  ],
  'edge-analysis-bi': [
    { x: 1203.1333333333334, y: 2849 }, { x: 1203.1333333333334, y: 3007 },
  ],
  'edge-tms-mobile': [
    { x: 1438, y: 2313 }, { x: 1438, y: 2243 }, { x: 1768, y: 2243 },
    { x: 1768, y: 253 }, { x: 1706, y: 253 }, { x: 1706, y: 181 },
  ],
  'edge-tms-performance': [
    { x: 1438, y: 2411 }, { x: 1438, y: 2483 }, { x: 1226, y: 2483 }, { x: 1226, y: 2751 },
  ],
  'edge-tms-carrier': [
    { x: 1486, y: 1985 }, { x: 1486, y: 1937 }, { x: 1789, y: 1937 },
    { x: 1789, y: 52 }, { x: 1414, y: 52 }, { x: 1414, y: 514 },
    { x: 1631, y: 514 }, { x: 1631, y: 374 }, { x: 1250, y: 374 }, { x: 1250, y: 181 },
  ],
  'edge-tms-execution-delivery': [
    { x: 1373, y: 2083 }, { x: 1373, y: 2314 },
  ],
  'edge-tms-cost': [
    { x: 1451, y: 1826 }, { x: 1451, y: 1875 }, { x: -288, y: 1875 },
    { x: -288, y: 3424 }, { x: 1746, y: 3424 }, { x: 1746, y: 2751 }, { x: 1682, y: 2751 },
  ],
  'edge-tms-planning-execution': [
    { x: 1461, y: 1827 }, { x: 1461, y: 1986 },
  ],
  'edge-upstream-oms': [
    { x: 758, y: 170 }, { x: 758, y: 225 }, { x: 322, y: 225 }, { x: 322, y: 511 },
  ],
  'edge-wms-inbound-outbound': [
    { x: 116, y: 1059 }, { x: 116, y: 1217 },
  ],
  'edge-wms-tms-planning': [
    { x: 116, y: 1314 }, { x: 116, y: 1386 }, { x: 1407, y: 1386 }, { x: 1407, y: 1707 },
  ],
};

/** Cold full-route output before crossed-spine closure (2026-08-09). */
export const tmsCrossedCostSpinePaths: Record<string, Array<{ x: number; y: number }>> = {
  'edge-cost-bi': [{ x: 1682, y: 2848 }, { x: 1682, y: 2921 }, { x: 1248, y: 2921 }, { x: 1248, y: 3008 }],
  'edge-driver-tms-execution': [{ x: 1523, y: 1186 }, { x: 1523, y: 1242 }, { x: 1537, y: 1242 }, { x: 1537, y: 1930 }, { x: 1513, y: 1930 }, { x: 1513, y: 1986 }],
  'edge-fleet-tms-planning': [{ x: 971, y: 1186 }, { x: 971, y: 1259 }, { x: 1466, y: 1259 }, { x: 1466, y: 1708 }],
  'edge-frp-wms-integration': [{ x: 1627.8, y: 571 }, { x: 1555, y: 571 }, { x: 1555, y: 1010 }, { x: 648, y: 1010 }],
  'edge-gps-tms-execution': [{ x: 1307.8, y: 571 }, { x: 1572.62, y: 571 }, { x: 1572.62, y: 2034 }, { x: 1512.62, y: 2034 }],
  'edge-oms-wms-inbound': [{ x: 203.325, y: 571 }, { x: 116, y: 571 }, { x: 116, y: 962 }],
  'edge-oms-wms-outbound': [{ x: 361, y: 630 }, { x: 361, y: 1145 }, { x: 116, y: 1145 }, { x: 116, y: 1218 }],
  'edge-analysis-bi': [{ x: 1203.1333333333334, y: 2848 }, { x: 1203.1333333333334, y: 3008 }],
  'edge-tms-mobile': [{ x: 1438, y: 2314 }, { x: 1438, y: 2193 }, { x: 1523, y: 2193 }, { x: 1523, y: 2092 }, { x: 1795.8, y: 2092 }, { x: 1795.8, y: 253 }, { x: 1706, y: 253 }, { x: 1706, y: 180 }],
  'edge-tms-performance': [{ x: 1438, y: 2410 }, { x: 1438, y: 2483 }, { x: 1226, y: 2483 }, { x: 1226, y: 2752 }],
  'edge-tms-carrier': [{ x: 1361, y: 2034 }, { x: -288, y: 2034 }, { x: -288, y: 84 }, { x: 1110, y: 84 }, { x: 1110, y: 132 }, { x: 1174, y: 132 }],
  'edge-tms-execution-delivery': [{ x: 1373, y: 2082 }, { x: 1373, y: 2314 }],
  'edge-tms-cost': [{ x: 1500.62, y: 1826 }, { x: 1500.62, y: 1922 }, { x: 1537, y: 1922 }, { x: 1537, y: 2752 }, { x: 1625.8, y: 2752 }],
  'edge-tms-planning-execution': [{ x: 1436.62, y: 1826 }, { x: 1436.62, y: 1986 }],
  'edge-upstream-oms': [{ x: 758, y: 168.5 }, { x: 758, y: 225 }, { x: 322, y: 225 }, { x: 322, y: 512 }],
  'edge-wms-inbound-outbound': [{ x: 116, y: 1058 }, { x: 116, y: 1218 }],
  'edge-wms-tms-planning': [{ x: 116, y: 1314 }, { x: 116, y: 1767 }, { x: 1348.62, y: 1767 }],
};
