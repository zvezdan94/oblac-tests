/** A physical device under test, identified by its EtherCAT position and serial number. */
export interface TestDevice {
  /** EtherCAT bus position (1-based). */
  position: number;
  /** Device serial number in `PPPP-VV-SSSSSSS-YYWW` format. */
  serialNumber: string;
  /** Short label used in test names (e.g. 'circulo', 'integro', 'node'). */
  name: string;
  /** Full product name. */
  productName: string;
}

/**
 * Ordered list of devices attached to the test rig.
 *
 * Position values must match the physical EtherCAT topology.
 * Tests that target a specific device select it by serial number.
 */
export const testDevices: TestDevice[] = [
  { position: 1, serialNumber: '9501-01-0001512-1851', name: 'node', productName: 'Node 400 EtherCAT' },
  {
    position: 2,
    serialNumber: '6000-01-0000578-2546',
    name: 'integro',
    productName: 'SOMANET Actilink S C Line G1, 60mm (ASC1-061A-0K-025-ECMH-M2G3-STO-01)',
  },
  {
    position: 3,
    serialNumber: '8602-01-0000755-2243',
    name: 'circulo',
    productName: 'Circulo 7 Safe Motion - 700, Safe Motion, Magnetic Rings (pos.1&2), with port 2 transceivers ',
  },
  { position: 1, serialNumber: '8603-02-0000224-2544', name: 'circulo-jd', productName: 'Circulo 9 JD' },
];

/** SOMANET Node 400 EtherCAT at EtherCAT position 1. */
export const nodeTestDevice: TestDevice = testDevices[0] as TestDevice;
/** SOMANET Integro-60 at EtherCAT position 2. */
export const integroTestDevice: TestDevice = testDevices[1] as TestDevice;
/** SOMANET Circulo 7 with Safe Motion Module at EtherCAT position 3. */
export const circuloTestDevice: TestDevice = testDevices[2] as TestDevice;
/** SOMANET Circulo 9 JD on Zvezdan's desk. */
export const circuloJdTestDevice: TestDevice = testDevices[3] as TestDevice;
