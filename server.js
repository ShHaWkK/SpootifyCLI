const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Les routes seront importées directement dans app.use()
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Configuration du moteur de template
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuration des sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'spootify-secret-key',
  resave: false,
  saveUninitialized: true, // Changé pour permettre la création de sessions
  cookie: {
    secure: false, // true en production avec HTTPS
    maxAge: 24 * 60 * 60 * 1000, // 24 heures
    httpOnly: true,
    sameSite: 'lax'
  },
  name: 'spootify.sid' // Nom personnalisé pour le cookie de session
}));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/player', require('./routes/player'));
app.use('/api/search', require('./routes/search'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/local', require('./routes/local'));

// Route principale
app.get('/', (req, res) => {
  if (!req.session.accessToken) {
    return res.render('login', {
      title: 'Spootify Web - Connexion'
    });
  }
  
  res.render('dashboard', {
    title: 'Spootify Web - Dashboard',
    user: req.session.user || null
  });
});

// Route de déconnexion
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erreur lors de la déconnexion:', err);
    }
    res.redirect('/');
  });
});

// Gestion des WebSockets pour les mises à jour en temps réel
io.on('connection', (socket) => {
  console.log('Utilisateur connecté:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Utilisateur déconnecté:', socket.id);
  });
  
  // Écouter les changements de statut de lecture
  socket.on('player-status-update', (data) => {
    socket.broadcast.emit('player-status-changed', data);
  });
});

// Middleware de gestion d'erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).render('error', {
    title: 'Erreur',
    message: 'Une erreur interne s\'est produite',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Gestion des routes 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page non trouvée',
    message: 'La page demandée n\'existe pas',
    error: {}
  });
});

server.listen(PORT, () => {
  console.log(`🎵 Spootify Web démarré sur http://localhost:${PORT}`);
  console.log('📱 Interface web disponible pour contrôler Spotify');
});

module.exports = { app, io };