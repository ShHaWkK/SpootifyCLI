const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');
const router = express.Router();

// Configuration Spotify (à définir dans .env)
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/auth/callback';

// Scopes nécessaires pour contrôler Spotify
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read'
].join(' ');

// Générer un état aléatoire pour la sécurité
function generateRandomString(length) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

// Route de connexion - Redirection vers Spotify
router.get('/login', (req, res) => {
  const state = generateRandomString(16);
  
  // Stocker l'état dans la session ET dans un cookie sécurisé
  req.session.authState = state;
  res.cookie('spotify_auth_state', state, {
    httpOnly: true,
    secure: false, // true en production avec HTTPS
    maxAge: 10 * 60 * 1000, // 10 minutes
    sameSite: 'lax'
  });
  
  console.log('🔐 Génération état auth:', state);
  console.log('📝 Session ID:', req.sessionID);
  console.log('🍪 Cookie état défini');
  
  const authURL = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      state: state,
      show_dialog: true
    });
  
  res.redirect(authURL);
});

// Route de callback après authentification
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  console.log('🔄 Callback reçu:');
  console.log('  - État reçu:', state);
  console.log('  - État session:', req.session.authState);
  console.log('  - État cookie:', req.cookies.spotify_auth_state);
  console.log('  - Session ID:', req.sessionID);
  console.log('  - Code:', code ? 'présent' : 'absent');
  
  if (error) {
    console.error('Erreur d\'authentification:', error);
    return res.render('error', {
      title: 'Erreur d\'authentification',
      message: 'L\'authentification avec Spotify a échoué',
      error: { message: error }
    });
  }
  
  // Vérifier l'état dans la session OU dans le cookie
  const expectedState = req.session.authState || req.cookies.spotify_auth_state;
  
  if (state !== expectedState) {
    console.error('❌ États différents:', {
      reçu: state,
      attenduSession: req.session.authState,
      attenduCookie: req.cookies.spotify_auth_state,
      sessionExists: !!req.session,
      sessionID: req.sessionID
    });
    return res.render('error', {
      title: 'Erreur de sécurité',
      message: 'État d\'authentification invalide',
      error: {}
    });
  }
  
  // Nettoyer le cookie d'état après utilisation
  res.clearCookie('spotify_auth_state');
  console.log('✅ Validation état réussie (source:', req.session.authState ? 'session' : 'cookie', ')');
  
  try {
    // Échanger le code contre un token d'accès
    const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', 
      querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      }), {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Récupérer les informations de l'utilisateur
    const userResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': 'Bearer ' + access_token
      }
    });
    
    // Stocker les tokens et informations utilisateur en session
    req.session.accessToken = access_token;
    req.session.refreshToken = refresh_token;
    req.session.tokenExpiry = Date.now() + (expires_in * 1000);
    req.session.user = {
      id: userResponse.data.id,
      display_name: userResponse.data.display_name,
      email: userResponse.data.email,
      images: userResponse.data.images,
      country: userResponse.data.country,
      product: userResponse.data.product
    };
    
    console.log(`✅ Utilisateur connecté: ${userResponse.data.display_name}`);
    res.redirect('/');
    
  } catch (error) {
    console.error('Erreur lors de l\'échange de token:', error.response?.data || error.message);
    res.render('error', {
      title: 'Erreur d\'authentification',
      message: 'Impossible d\'obtenir le token d\'accès',
      error: error
    });
  }
});

// Route pour rafraîchir le token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.session;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'Aucun refresh token disponible' });
  }
  
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }), {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const { access_token, expires_in, refresh_token } = response.data;
    
    req.session.accessToken = access_token;
    req.session.tokenExpiry = Date.now() + (expires_in * 1000);
    
    if (refresh_token) {
      req.session.refreshToken = refresh_token;
    }
    
    res.json({ success: true, access_token });
    
  } catch (error) {
    console.error('Erreur lors du rafraîchissement du token:', error.response?.data || error.message);
    res.status(500).json({ error: 'Impossible de rafraîchir le token' });
  }
});

// Middleware pour vérifier l'authentification
function requireAuth(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  // Vérifier si le token a expiré
  if (Date.now() >= req.session.tokenExpiry) {
    return res.status(401).json({ error: 'Token expiré', needsRefresh: true });
  }
  
  next();
}

module.exports = router;
module.exports.requireAuth = requireAuth;