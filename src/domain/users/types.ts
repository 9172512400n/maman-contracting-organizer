export type UserAccount = {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string;
  status: string;
  authUid: string;
  removed: boolean;
  removedBy: string;
  removedAt: string;
  invitedBy: string;
  invitedAt: string;
  inviteAcceptedAt: string;
  inviteToken: string;
  inviteLink: string;
  activatedAt: string;
  updatedAt: string;
};

export type UserInviteInput = {
  email: string;
  role: string;
  inviteToken?: string;
};

export type UserUpdateInput = {
  id: string;
  name: string;
  role: string;
  phone: string;
};
