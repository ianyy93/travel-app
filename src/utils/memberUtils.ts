import { TripMember } from '../constants';

export const expandMembers = (memberIds: string[] | undefined, allMembers: TripMember[]): string[] => {
  if (!memberIds || memberIds.length === 0 || memberIds.includes('everyone')) {
    return allMembers.map(m => m.id);
  }
  return memberIds;
};
