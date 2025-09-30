import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes.js';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error.js';

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: false }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', routes);

// manejador de errores al final
app.use(errorHandler);
