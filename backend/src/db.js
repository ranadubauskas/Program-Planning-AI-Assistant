// Single Mongoose instance for the whole app (server + seeders)
import mongoose from 'mongoose';

export const connectDB = (uri) =>
  mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

export { mongoose };
