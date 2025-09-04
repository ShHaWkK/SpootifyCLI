const express = require('express');
const axios = require('axios');
const authRouter = require('./auth');
const requireAuth = authRouter.requireAuth;
const router = express.Router();

// Middleware d'authentification
router.use(requireAuth);

// Fonction helper pour les requêtes Spotify
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

// Obtenir les playlists de l'utilisateur
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const playlists = await spotifyRequest(req, 'GET', 
      `/me/playlists?limit=${limit}&offset=${offset}`);
    
    const formattedPlaylists = {
      items: playlists.items.map(playlist => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        images: playlist.images,
        owner: {
          id: playlist.owner.id,
          display_name: playlist.owner.display_name
        },
        tracks: {
          total: playlist.tracks.total
        },
        uri: playlist.uri,
        external_urls: playlist.external_urls,
        public: playlist.public,
        collaborative: playlist.collaborative
      })),
      total: playlists.total,
      limit: playlists.limit,
      offset: playlists.offset
    };
    
    res.json(formattedPlaylists);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des playlists:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les détails d'une playlist
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const playlist = await spotifyRequest(req, 'GET', 
      `/playlists/${id}?limit=${limit}&offset=${offset}`);
    
    const formattedPlaylist = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      images: playlist.images,
      owner: {
        id: playlist.owner.id,
        display_name: playlist.owner.display_name
      },
      followers: playlist.followers.total,
      public: playlist.public,
      collaborative: playlist.collaborative,
      uri: playlist.uri,
      external_urls: playlist.external_urls,
      tracks: {
        items: playlist.tracks.items.map(item => ({
          added_at: item.added_at,
          added_by: {
            id: item.added_by.id
          },
          track: item.track ? {
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
          } : null
        })).filter(item => item.track !== null),
        total: playlist.tracks.total,
        limit: playlist.tracks.limit,
        offset: playlist.tracks.offset
      }
    };
    
    res.json(formattedPlaylist);
    
  } catch (error) {
    console.error('Erreur lors de la récupération de la playlist:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Jouer une playlist
router.post('/:id/play', async (req, res) => {
  try {
    const { id } = req.params;
    const { offset = 0 } = req.body;
    
    const playData = {
      context_uri: `spotify:playlist:${id}`
    };
    
    if (offset > 0) {
      playData.offset = { position: offset };
    }
    
    await spotifyRequest(req, 'PUT', '/me/player/play', playData);
    
    res.json({ success: true, message: 'Playlist en cours de lecture' });
    
  } catch (error) {
    console.error('Erreur lors de la lecture de la playlist:', error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: 'Aucun appareil actif trouvé. Ouvrez Spotify sur un appareil.' 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Créer une nouvelle playlist
router.post('/create', async (req, res) => {
  try {
    const { name, description = '', public: isPublic = false } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Le nom de la playlist est requis' });
    }
    
    const userId = req.session.user.id;
    
    const newPlaylist = await spotifyRequest(req, 'POST', `/users/${userId}/playlists`, {
      name,
      description,
      public: isPublic
    });
    
    res.json({
      success: true,
      playlist: {
        id: newPlaylist.id,
        name: newPlaylist.name,
        description: newPlaylist.description,
        uri: newPlaylist.uri,
        external_urls: newPlaylist.external_urls
      }
    });
    
  } catch (error) {
    console.error('Erreur lors de la création de la playlist:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Ajouter des pistes à une playlist
router.post('/:id/tracks', async (req, res) => {
  try {
    const { id } = req.params;
    const { uris, position } = req.body;
    
    if (!uris || !Array.isArray(uris) || uris.length === 0) {
      return res.status(400).json({ error: 'URIs des pistes requis' });
    }
    
    const addData = { uris };
    if (position !== undefined) {
      addData.position = position;
    }
    
    const result = await spotifyRequest(req, 'POST', `/playlists/${id}/tracks`, addData);
    
    res.json({
      success: true,
      snapshot_id: result.snapshot_id,
      message: `${uris.length} piste(s) ajoutée(s) à la playlist`
    });
    
  } catch (error) {
    console.error('Erreur lors de l\'ajout de pistes:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Supprimer des pistes d'une playlist
router.delete('/:id/tracks', async (req, res) => {
  try {
    const { id } = req.params;
    const { tracks } = req.body;
    
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({ error: 'Pistes à supprimer requises' });
    }
    
    const result = await spotifyRequest(req, 'DELETE', `/playlists/${id}/tracks`, {
      tracks: tracks.map(track => ({ uri: track.uri }))
    });
    
    res.json({
      success: true,
      snapshot_id: result.snapshot_id,
      message: `${tracks.length} piste(s) supprimée(s) de la playlist`
    });
    
  } catch (error) {
    console.error('Erreur lors de la suppression de pistes:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Modifier les détails d'une playlist
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, public: isPublic } = req.body;
    
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isPublic !== undefined) updateData.public = isPublic;
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }
    
    await spotifyRequest(req, 'PUT', `/playlists/${id}`, updateData);
    
    res.json({
      success: true,
      message: 'Playlist mise à jour avec succès'
    });
    
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la playlist:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les playlists recommandées/populaires
router.get('/featured/playlists', async (req, res) => {
  try {
    const { limit = 20, offset = 0, country = 'FR' } = req.query;
    
    const featured = await spotifyRequest(req, 'GET', 
      `/browse/featured-playlists?limit=${limit}&offset=${offset}&country=${country}`);
    
    const formattedPlaylists = {
      message: featured.message,
      playlists: {
        items: featured.playlists.items.map(playlist => ({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          images: playlist.images,
          owner: {
            id: playlist.owner.id,
            display_name: playlist.owner.display_name
          },
          tracks: {
            total: playlist.tracks.total
          },
          uri: playlist.uri,
          external_urls: playlist.external_urls
        })),
        total: featured.playlists.total,
        limit: featured.playlists.limit,
        offset: featured.playlists.offset
      }
    };
    
    res.json(formattedPlaylists);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des playlists recommandées:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;