/**
 * Loads the generated FF-01 campus model. Kept free of three.js so the request can
 * start as soon as the app boots, in parallel with the (larger) 3D code.
 *
 * Both files are emitted with content hashes, so they can be cached for a year.
 */
import coreUrl from '../../generated/ff01-campus-core.json?url';
import detailUrl from '../../generated/ff01-campus-detail.json?url';
import type { CampusDetailData, CampusModelData } from './campusModel3d';

let core: Promise<CampusModelData> | null = null;
let detail: Promise<CampusDetailData> | null = null;

const getJson = async <T,>(url: string, priority: 'high' | 'low'): Promise<T> => {
  const response = await fetch(url, { priority } as RequestInit);
  if (!response.ok) throw new Error(`Campus model request failed: ${response.status}`);
  return response.json();
};

/** Walls, rooms and arena: everything needed for the first frame. */
export function loadCampusCore(): Promise<CampusModelData> {
  core ??= getJson<CampusModelData>(coreUrl, 'high').catch((error) => { core = null; throw error; });
  return core;
}

/** Furniture, door, stair and court lines: drawn once the building is on screen. */
export function loadCampusDetail(): Promise<CampusDetailData> {
  detail ??= getJson<CampusDetailData>(detailUrl, 'low').catch((error) => { detail = null; throw error; });
  return detail;
}
