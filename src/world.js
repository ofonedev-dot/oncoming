/**
 * Oncoming — arcade crash-racer in Ember Bay.
 * Original IP. Not affiliated with EA or any other publisher.
 */
import * as THREE from 'three';
import { pack, partsOf } from './pack.js';

export { THREE, pack, partsOf };

const BLOCK = pack.world?.block ?? 52;
const GRID = pack.world?.grid ?? 10;
const ROAD_W = 16;
const LANE = 3.4;
const CITY = GRID * BLOCK;
const PLAYER_R = 1.28;
const TRAFFIC_R = 1.2;

const CAR_NAMES = pack.vehicles.filter((v) => v.traffic).map((v) => v.name);
