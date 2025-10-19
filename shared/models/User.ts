import mongoose, { Schema, Document, models } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IUser extends Document {
  email: string;
  name: string;
  username: string;
  uuid: string;
  password?: string;
  tokens: number;
  emailVerified?: Date | null;
  verificationTokenHash?: string | null;
  verificationTokenExpires?: Date | null;
  verificationEmailSentAt?: Date | null;
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  uuid: { type: String, default: () => uuidv4(), required: true, unique: true },
  password: { type: String, required: true },
  tokens: { type: Number, default: 1000 },
  emailVerified: { type: Date, default: null },
  verificationTokenHash: { type: String, default: null },
  verificationTokenExpires: { type: Date, default: null },
  verificationEmailSentAt: { type: Date, default: null },
}, { timestamps: true });

const User = models.User || mongoose.model<IUser>('User', UserSchema);
export default User;
