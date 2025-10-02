// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const session = require('express-session');
const flash = require('connect-flash');
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');
const { initScheduler } = require('./services/scheduler');
const os = require('os');

// Initialize
const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/social_admin';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// MongoDB Connection
mongoose
  .connect(MONGO_URI, {
    autoIndex: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Middlewares
// Trust proxy for correct protocol/host if behind a reverse proxy (e.g., Render, Nginx)
app.set('trust proxy', 1);
app.use(morgan('dev'));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());

// Health check endpoint for readiness/liveness probes
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  });
});

// Flash message locals
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// Routes 
const adminRouter = require('./routes/admin');
const postsApiRouter = require('./routes/api/posts');
const accountsApiRouter = require('./routes/api/accounts');
const schedulerApiRouter = require('./routes/api/scheduler');

app.use('/', (req, res, next) => {
  if (req.path === '/') return res.redirect('/admin/dashboard');
  next();
});

// Admin pages
app.use('/admin', adminRouter);

// REST APIs
app.use('/api/posts', postsApiRouter);
app.use('/api/accounts', accountsApiRouter);
app.use('/api/scheduler', schedulerApiRouter);

// 404 handler
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Not Found' });
  }
  res.status(404).render('404');
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal Server Error',
      details: err.details || undefined,
    });
  }
  req.flash('error', err.message || 'Something went wrong');
  res.redirect('back');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`[Config] BASE_URL = ${BASE_URL}`);
  // Initialize cron-based Instagram posting scheduler
  try {
    initScheduler();
  } catch (e) {
    console.error('Scheduler init error:', e);
  }
});

