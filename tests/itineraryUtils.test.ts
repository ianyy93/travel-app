import assert from 'node:assert/strict';
import { estimateTravelMinutes, getTravelModeLabel, inferTravelMode } from '../src/lib/itineraryUtils';

const cases = [
  {
    name: 'estimates drive travel time with a realistic buffer',
    fn: () => estimateTravelMinutes(40, 'drive'),
    expected: 65,
  },
  {
    name: 'returns a readable label for rideshare mode',
    fn: () => getTravelModeLabel('rideshare'),
    expected: 'Rideshare',
  },
  {
    name: 'infers walk for very short distances',
    fn: () => inferTravelMode({ name: 'A', lat: 0, lng: 0 }, { name: 'B', lat: 0.0001, lng: 0 }, 'drive'),
    expected: 'walk',
  },
] as const;

for (const testCase of cases) {
  const actual = testCase.fn();
  assert.equal(actual, testCase.expected, `${testCase.name}: expected ${testCase.expected}, got ${actual}`);
}

console.log('itineraryUtils tests passed');
