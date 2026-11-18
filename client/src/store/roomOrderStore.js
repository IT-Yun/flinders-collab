import { create } from 'zustand';

export const useRoomOrderStore = create((set) => ({
  orderedIdsByUser: {},
  setOrder: (userId, orderedIds) => {
    if (!userId) return;

    set((state) => ({
      orderedIdsByUser: {
        ...state.orderedIdsByUser,
        [userId]: orderedIds,
      },
    }));
  },
}));
