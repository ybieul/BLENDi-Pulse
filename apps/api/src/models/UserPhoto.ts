import mongoose, { type Document } from 'mongoose';

const userPhotoFileTypeValues = ['jpeg', 'png'] as const;

export type UserPhotoFileType = (typeof userPhotoFileTypeValues)[number];

export interface IUserPhoto {
  userId: mongoose.Types.ObjectId;
  imageBase64: string;
  fileType: UserPhotoFileType;
  updatedAt: Date;
}

export type UserPhotoDocument = Document<unknown, object, IUserPhoto> & IUserPhoto;

const userPhotoSchema = new mongoose.Schema<IUserPhoto>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
    },
    imageBase64: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      minlength: [1, 'errors.validation.required'],
    },
    fileType: {
      type: String,
      required: [true, 'errors.validation.required'],
      enum: userPhotoFileTypeValues,
    },
  },
  {
    collection: 'user_photos',
    timestamps: { createdAt: false, updatedAt: true },
  }
);

userPhotoSchema.index({ userId: 1 }, { unique: true });

export const UserPhotoModel = mongoose.model<IUserPhoto>('UserPhoto', userPhotoSchema);
