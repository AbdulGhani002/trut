import mongoose, { Schema, Document, models } from 'mongoose';

export interface ITournamentPlayer {
  userId: string;
  email: string;
  name: string;
  checkedIn: boolean;
  seed?: number;
  eliminated?: boolean;
}

export interface IMatch {
  id: string; // short id
  round: number; // 1..4 (1: R16, 2: QF, 3: SF, 4: Final)
  slotA?: string | null; // userId
  slotB?: string | null; // userId
  winner?: string | null; // userId
  loser?: string | null; // userId
  bestOf: number;
  finished?: boolean;
  isBronze?: boolean;
}

export interface ITournament extends Document {
  name: string;
  ownerId: string;
  players: ITournamentPlayer[];
  matches: IMatch[];
  buyIn: number;
  prizePool: number;
  status: 'registration' | 'checkin' | 'ongoing' | 'completed' | 'cancelled';
  maxPlayers: number;
  checkinEndsAt?: Date | null;
}

const TournamentPlayerSchema = new Schema<ITournamentPlayer>({
  userId: { type: String, required: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  checkedIn: { type: Boolean, default: false },
  seed: { type: Number },
  eliminated: { type: Boolean, default: false },
});

const MatchSchema = new Schema<IMatch>({
  id: { type: String, required: true },
  round: { type: Number, required: true },
  slotA: { type: String, default: null },
  slotB: { type: String, default: null },
  winner: { type: String, default: null },
  loser: { type: String, default: null },
  bestOf: { type: Number, required: true },
  finished: { type: Boolean, default: false },
  isBronze: { type: Boolean, default: false },
});

const TournamentSchema = new Schema<ITournament>({
  name: { type: String, required: true },
  ownerId: { type: String, required: true },
  players: { type: [TournamentPlayerSchema], default: [] },
  matches: { type: [MatchSchema], default: [] },
  buyIn: { type: Number, required: true },
  prizePool: { type: Number, default: 0 },
  status: { type: String, default: 'registration' },
  maxPlayers: { type: Number, default: 16 },
  checkinEndsAt: { type: Date, default: null },
}, { timestamps: true });

const Tournament = models.Tournament || mongoose.model<ITournament>('Tournament', TournamentSchema);
export default Tournament;
