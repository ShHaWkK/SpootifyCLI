const express = require('express');
const axios = require('axios');
const fetch = require('node-fetch'); // Pour l'API de paroles
const authRouter = require('./auth');
const requireAuth = authRouter.requireAuth;
const router = express.Router();

// Middleware d'authentification pour toutes les routes
router.use(requireAuth);

// Fonction helper pour faire des requêtes à l'API Spotify
async function spotifyRequest(req, method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `https://api.spotify.com/v1${endpoint}`,
      headers: {
        'Authorization': `Bearer ${req.session.accessToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Token expiré');
    }
    throw error;
  }
}

// Obtenir l'état actuel de lecture
router.get('/status', async (req, res) => {
  try {
    const playbackState = await spotifyRequest(req, 'GET', '/me/player');
    
    if (!playbackState) {
      return res.json({
        isPlaying: false,
        message: 'Aucun appareil actif trouvé'
      });
    }
    
    const currentTrack = playbackState.item;
    
    res.json({
      isPlaying: playbackState.is_playing,
      progress: playbackState.progress_ms,
      duration: currentTrack?.duration_ms,
      volume: playbackState.device?.volume_percent,
      shuffleState: playbackState.shuffle_state,
      repeatState: playbackState.repeat_state,
      device: {
        name: playbackState.device?.name,
        type: playbackState.device?.type,
        volume: playbackState.device?.volume_percent
      },
      track: currentTrack ? {
        id: currentTrack.id,
        name: currentTrack.name,
        artists: currentTrack.artists.map(artist => artist.name),
        album: {
          name: currentTrack.album.name,
          images: currentTrack.album.images
        },
        duration: currentTrack.duration_ms,
        preview_url: currentTrack.preview_url,
        external_urls: currentTrack.external_urls
      } : null
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du statut:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Lancer la lecture
router.post('/play', async (req, res) => {
  try {
    // Vérifier les appareils actifs avant de tenter la lecture
    try {
      const devicesResponse = await spotifyRequest(req, 'GET', '/me/player/devices');
      const activeDevices = devicesResponse.devices?.filter(device => device.is_active) || [];
      
      if (activeDevices.length === 0) {
        return res.status(404).json({ 
          error: 'Aucun appareil actif trouvé. Ouvrez Spotify sur un appareil.',
          code: 'NO_ACTIVE_DEVICE'
        });
      }
    } catch (deviceError) {
      console.error('Erreur lors de la vérification des appareils:', deviceError.message);
      return res.status(404).json({ 
        error: 'Impossible de vérifier les appareils Spotify.',
        code: 'DEVICE_CHECK_FAILED'
      });
    }
    
    const { uris, context_uri, offset } = req.body;
    
    const playData = {};
    if (uris) playData.uris = uris;
    if (context_uri) playData.context_uri = context_uri;
    if (offset) playData.offset = offset;
    
    await spotifyRequest(req, 'PUT', '/me/player/play', Object.keys(playData).length > 0 ? playData : undefined);
    
    res.json({ success: true, message: 'Lecture démarrée' });
  } catch (error) {
    console.error('Erreur lors du démarrage de la lecture:', error.message);
    
    if (error.response?.status === 403) {
      return res.status(403).json({ 
        error: 'Accès refusé. Vérifiez vos permissions Spotify.',
        code: 'ACCESS_DENIED'
      });
    }
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: 'Aucun appareil actif trouvé. Ouvrez Spotify sur un appareil.',
        code: 'NO_ACTIVE_DEVICE'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Mettre en pause
router.post('/pause', async (req, res) => {
  try {
    await spotifyRequest(req, 'PUT', '/me/player/pause');
    res.json({ success: true, message: 'Lecture mise en pause' });
  } catch (error) {
    console.error('Erreur lors de la mise en pause:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Piste suivante
router.post('/next', async (req, res) => {
  try {
    await spotifyRequest(req, 'POST', '/me/player/next');
    res.json({ success: true, message: 'Piste suivante' });
  } catch (error) {
    console.error('Erreur lors du passage à la piste suivante:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Piste précédente
router.post('/previous', async (req, res) => {
  try {
    await spotifyRequest(req, 'POST', '/me/player/previous');
    res.json({ success: true, message: 'Piste précédente' });
  } catch (error) {
    console.error('Erreur lors du retour à la piste précédente:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Contrôler le volume
router.post('/volume', async (req, res) => {
  try {
    const { volume } = req.body;
    
    if (volume < 0 || volume > 100) {
      return res.status(400).json({ error: 'Le volume doit être entre 0 et 100' });
    }
    
    await spotifyRequest(req, 'PUT', `/me/player/volume?volume_percent=${volume}`);
    res.json({ success: true, message: `Volume réglé à ${volume}%` });
  } catch (error) {
    console.error('Erreur lors du réglage du volume:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Contrôler la lecture aléatoire
router.post('/shuffle', async (req, res) => {
  try {
    const { state } = req.body;
    await spotifyRequest(req, 'PUT', `/me/player/shuffle?state=${state}`);
    res.json({ success: true, message: `Lecture aléatoire ${state ? 'activée' : 'désactivée'}` });
  } catch (error) {
    console.error('Erreur lors du contrôle de la lecture aléatoire:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Contrôler la répétition
router.post('/repeat', async (req, res) => {
  try {
    const { state } = req.body; // 'track', 'context', 'off'
    await spotifyRequest(req, 'PUT', `/me/player/repeat?state=${state}`);
    res.json({ success: true, message: `Mode de répétition: ${state}` });
  } catch (error) {
    console.error('Erreur lors du contrôle de la répétition:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Rechercher la position dans la piste
router.post('/seek', async (req, res) => {
  try {
    const { position } = req.body;
    await spotifyRequest(req, 'PUT', `/me/player/seek?position_ms=${position}`);
    res.json({ success: true, message: 'Position mise à jour' });
  } catch (error) {
    console.error('Erreur lors du changement de position:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les appareils disponibles
router.get('/devices', async (req, res) => {
  try {
    const devices = await spotifyRequest(req, 'GET', '/me/player/devices');
    res.json(devices);
  } catch (error) {
    console.error('Erreur lors de la récupération des appareils:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Transférer la lecture vers un appareil
router.post('/transfer', async (req, res) => {
  try {
    const { device_id, play } = req.body;
    
    await spotifyRequest(req, 'PUT', '/me/player', {
      device_ids: [device_id],
      play: play || false
    });
    
    res.json({ success: true, message: 'Lecture transférée' });
  } catch (error) {
    console.error('Erreur lors du transfert:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les titres likés de l'utilisateur
router.get('/liked-tracks', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const likedTracks = await spotifyRequest(req, 'GET', 
      `/me/tracks?limit=${limit}&offset=${offset}`);
    
    const formattedTracks = {
      items: likedTracks.items.map(item => ({
        added_at: item.added_at,
        track: {
          id: item.track.id,
          name: item.track.name,
          artists: item.track.artists.map(artist => ({
            id: artist.id,
            name: artist.name
          })),
          album: {
            id: item.track.album.id,
            name: item.track.album.name,
            images: item.track.album.images
          },
          duration_ms: item.track.duration_ms,
          preview_url: item.track.preview_url,
          uri: item.track.uri,
          popularity: item.track.popularity,
          explicit: item.track.explicit
        }
      })),
      total: likedTracks.total,
      limit: likedTracks.limit,
      offset: likedTracks.offset
    };
    
    res.json(formattedTracks);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des titres likés:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les pistes récemment jouées
router.get('/recently-played', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const recentTracks = await spotifyRequest(req, 'GET', 
      `/me/player/recently-played?limit=${limit}`);
    
    const formattedTracks = {
      items: recentTracks.items.map(item => ({
        played_at: item.played_at,
        track: {
          id: item.track.id,
          name: item.track.name,
          artists: item.track.artists.map(artist => ({
            id: artist.id,
            name: artist.name
          })),
          album: {
            id: item.track.album.id,
            name: item.track.album.name,
            images: item.track.album.images
          },
          duration_ms: item.track.duration_ms,
          preview_url: item.track.preview_url,
          uri: item.track.uri,
          popularity: item.track.popularity,
          explicit: item.track.explicit
        }
      })),
      total: recentTracks.items.length,
      limit: parseInt(limit)
    };
    
    res.json(formattedTracks);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des pistes récentes:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Jouer les titres likés
router.post('/liked-tracks/play', async (req, res) => {
  try {
    const { offset = 0 } = req.body;
    
    // Vérifier d'abord s'il y a des appareils disponibles
    try {
      const devices = await spotifyRequest(req, 'GET', '/me/player/devices');
      if (!devices.devices || devices.devices.length === 0) {
        return res.status(404).json({ 
          error: 'Aucun appareil Spotify actif trouvé. Ouvrez Spotify sur un appareil ou utilisez le lecteur web intégré.',
          code: 'NO_ACTIVE_DEVICE'
        });
      }
    } catch (deviceError) {
      console.error('Erreur lors de la vérification des appareils:', deviceError.message);
      return res.status(404).json({ 
        error: 'Impossible de vérifier les appareils Spotify. Utilisez le lecteur web intégré.',
        code: 'DEVICE_CHECK_FAILED'
      });
    }
    
    // Pour les titres likés, on doit d'abord récupérer les URIs des pistes
    const likedTracks = await spotifyRequest(req, 'GET', '/me/tracks?limit=50');
    
    if (!likedTracks.items || likedTracks.items.length === 0) {
      return res.status(404).json({ error: 'Aucun titre liké trouvé' });
    }
    
    const trackUris = likedTracks.items.map(item => item.track.uri);
    
    const playData = {
      uris: trackUris
    };
    
    if (offset > 0 && offset < trackUris.length) {
      playData.offset = { position: offset };
    }
    
    await spotifyRequest(req, 'PUT', '/me/player/play', playData);
    
    res.json({ success: true, message: 'Titres likés en cours de lecture' });
    
  } catch (error) {
    console.error('Erreur lors de la lecture des titres likés:', error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: 'Aucun appareil actif trouvé. Ouvrez Spotify sur un appareil ou utilisez le lecteur web intégré.',
        code: 'NO_ACTIVE_DEVICE'
      });
    }
    
    if (error.response?.status === 403) {
      return res.status(403).json({ 
        error: 'Accès refusé. Vérifiez vos permissions Spotify.',
        code: 'ACCESS_DENIED'
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Route pour obtenir les preview URLs des titres likés
router.get('/liked-tracks/previews', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const likedTracks = await spotifyRequest(req, 'GET', 
      `/me/tracks?limit=${limit}&offset=${offset}`);
    
    const tracksWithPreviews = likedTracks.items
      .filter(item => item.track.preview_url) // Filtrer seulement les pistes avec preview
      .map(item => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map(artist => artist.name).join(', '),
        album: {
          name: item.track.album.name,
          images: item.track.album.images
        },
        duration_ms: item.track.duration_ms,
        preview_url: item.track.preview_url,
        uri: item.track.uri,
        added_at: item.added_at
      }));
    
    res.json({
      tracks: tracksWithPreviews,
      total: tracksWithPreviews.length,
      total_liked: likedTracks.total
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération des previews des titres likés:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Route pour obtenir les paroles d'une chanson
router.get('/lyrics', async (req, res) => {
  try {
    const { track, artist } = req.query;
    
    if (!track || !artist) {
      return res.status(400).json({ 
        success: false, 
        error: 'Paramètres track et artist requis' 
      });
    }

    // Utilisation de l'API Lyrics.ovh (gratuite)
    const lyricsResponse = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(track)}`
    );
    
    if (lyricsResponse.ok) {
      const lyricsData = await lyricsResponse.json();
      if (lyricsData.lyrics) {
        return res.json({ 
          success: true, 
          lyrics: lyricsData.lyrics.trim(),
          source: 'lyrics.ovh'
        });
      }
    }

    // Fallback: essayer avec une recherche simplifiée
    const simplifiedTrack = track.replace(/\s*\([^)]*\)/g, '').trim(); // Enlever les parenthèses
    const fallbackResponse = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(simplifiedTrack)}`
    );
    
    if (fallbackResponse.ok) {
      const fallbackData = await fallbackResponse.json();
      if (fallbackData.lyrics) {
        return res.json({ 
          success: true, 
          lyrics: fallbackData.lyrics.trim(),
          source: 'lyrics.ovh (simplified)'
        });
      }
    }

    // Si aucune parole trouvée
    res.json({ 
      success: false, 
      error: 'Paroles non trouvées',
      message: `Aucune parole disponible pour "${track}" de ${artist}`
    });
    
  } catch (error) {
    console.error('❌ Error fetching lyrics:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des paroles',
      details: error.message 
    });
  }
});

// Route pour ajouter une piste à la file d'attente
router.post('/queue', async (req, res) => {
  try {
    const { uri } = req.body;
    
    if (!uri) {
      return res.status(400).json({ 
        success: false, 
        error: 'URI de la piste requis' 
      });
    }

    // Vérifier d'abord s'il y a des appareils disponibles
    try {
      const devices = await spotifyRequest(req, 'GET', '/me/player/devices');
      if (!devices.devices || devices.devices.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Aucun appareil Spotify actif trouvé. Ouvrez Spotify sur un appareil.',
          code: 'NO_ACTIVE_DEVICE'
        });
      }
    } catch (deviceError) {
      console.error('Erreur lors de la vérification des appareils:', deviceError.message);
      return res.status(404).json({ 
        success: false,
        error: 'Impossible de vérifier les appareils Spotify.',
        code: 'DEVICE_CHECK_FAILED'
      });
    }

    await spotifyRequest(req, 'POST', '/me/player/queue', { uri });
    res.json({ 
      success: true, 
      message: 'Piste ajoutée à la file d\'attente' 
    });
    
  } catch (error) {
    console.error('❌ Error adding to queue:', error);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        success: false,
        error: 'Aucun appareil actif trouvé. Ouvrez Spotify sur un appareil.',
        code: 'NO_ACTIVE_DEVICE'
      });
    }
    
    if (error.response?.status === 400) {
      return res.status(400).json({ 
        success: false,
        error: 'Requête invalide. Vérifiez que Spotify est ouvert et qu\'un appareil est actif.',
        code: 'BAD_REQUEST'
      });
    }
    
    if (error.response?.status === 403) {
      return res.status(403).json({ 
        success: false,
        error: 'Accès refusé. Vérifiez vos permissions Spotify.',
        code: 'ACCESS_DENIED'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'ajout à la file',
      details: error.message 
    });
  }
});

module.exports = router;