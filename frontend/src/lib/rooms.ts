export const ROOM_IDS = ['mainHall', 'conferenceRoomA', 'executiveOffice', 'serverRoom'] as const;
export type RoomId = (typeof ROOM_IDS)[number];
