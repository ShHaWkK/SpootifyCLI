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

// Recherche générale
router.get('/', async (req, res) => {
  try {
    const { q, type = 'track', limit = 20, offset = 0 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Paramètre de recherche requis' });
    }
    
    const validTypes = ['track', 'artist', 'album', 'playlist'];
    const searchTypes = type.split(',').filter(t => validTypes.includes(t));
    
    if (searchTypes.length === 0) {
      return res.status(400).json({ 
        error: 'Type de recherche invalide. Types valides: ' + validTypes.join(', ') 
      });
    }
    
    const searchParams = new URLSearchParams({
      q: q,
      type: searchTypes.join(','),
      limit: Math.min(parseInt(limit), 50),
      offset: parseInt(offset)
    });
    
    const results = await spotifyRequest(req, 'GET', `/search?${searchParams}`);
    
    // Formater les résultats pour l'interface
    const formattedResults = {};
    
    if (results.tracks) {
      formattedResults.tracks = {
        items: results.tracks.items.map(track => ({
          id: track.id,
          name: track.name,
          artists: track.artists.map(artist => ({
            id: artist.id,
            name: artist.name
          })),
          album: {
            id: track.album.id,
            name: track.album.name,
            images: track.album.images
          },
          duration_ms: track.duration_ms,
          preview_url: track.preview_url,
          uri: track.uri,
          external_urls: track.external_urls,
          popularity: track.popularity
        })),
        total: results.tracks.total,
        limit: results.tracks.limit,
        offset: results.tracks.offset
      };
    }
    
    if (results.artists) {
      formattedResults.artists = {
        items: results.artists.items.map(artist => ({
          id: artist.id,
          name: artist.name,
          images: artist.images,
          genres: artist.genres,
          popularity: artist.popularity,
          followers: artist.followers.total,
          uri: artist.uri,
          external_urls: artist.external_urls
        })),
        total: results.artists.total,
        limit: results.artists.limit,
        offset: results.artists.offset
      };
    }
    
    if (results.albums) {
      formattedResults.albums = {
        items: results.albums.items.map(album => ({
          id: album.id,
          name: album.name,
          artists: album.artists.map(artist => ({
            id: artist.id,
            name: artist.name
          })),
          images: album.images,
          release_date: album.release_date,
          total_tracks: album.total_tracks,
          uri: album.uri,
          external_urls: album.external_urls
        })),
        total: results.albums.total,
        limit: results.albums.limit,
        offset: results.albums.offset
      };
    }
    
    if (results.playlists) {
      formattedResults.playlists = {
        items: results.playlists.items.map(playlist => ({
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
          public: playlist.public
        })),
        total: results.playlists.total,
        limit: results.playlists.limit,
        offset: results.playlists.offset
      };
    }
    
    res.json(formattedResults);
    
  } catch (error) {
    console.error('Erreur lors de la recherche:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Recherche de suggestions/autocomplétion
router.get('/suggestions', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }
    
    // Recherche rapide pour l'autocomplétion
    const results = await spotifyRequest(req, 'GET', 
      `/search?q=${encodeURIComponent(q)}&type=track,artist&limit=${limit}`);
    
    const suggestions = [];
    
    // Ajouter les artistes
    if (results.artists) {
      results.artists.items.forEach(artist => {
        suggestions.push({
          type: 'artist',
          id: artist.id,
          name: artist.name,
          image: artist.images[0]?.url
        });
      });
    }
    
    // Ajouter les pistes
    if (results.tracks) {
      results.tracks.items.forEach(track => {
        suggestions.push({
          type: 'track',
          id: track.id,
          name: track.name,
          artist: track.artists[0]?.name,
          image: track.album.images[0]?.url
        });
      });
    }
    
    res.json({ suggestions: suggestions.slice(0, limit) });
    
  } catch (error) {
    console.error('Erreur lors de la recherche de suggestions:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les détails d'une piste
router.get('/track/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const track = await spotifyRequest(req, 'GET', `/tracks/${id}`);
    
    res.json({
      id: track.id,
      name: track.name,
      artists: track.artists.map(artist => ({
        id: artist.id,
        name: artist.name
      })),
      album: {
        id: track.album.id,
        name: track.album.name,
        images: track.album.images,
        release_date: track.album.release_date
      },
      duration_ms: track.duration_ms,
      preview_url: track.preview_url,
      uri: track.uri,
      external_urls: track.external_urls,
      popularity: track.popularity,
      explicit: track.explicit
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération de la piste:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les détails d'un artiste
router.get('/artist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const artist = await spotifyRequest(req, 'GET', `/artists/${id}`);
    
    res.json({
      id: artist.id,
      name: artist.name,
      images: artist.images,
      genres: artist.genres,
      popularity: artist.popularity,
      followers: artist.followers.total,
      uri: artist.uri,
      external_urls: artist.external_urls
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'artiste:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obtenir les top tracks d'un artiste
router.get('/artist/:id/top-tracks', async (req, res) => {
  try {
    const { id } = req.params;
    const { country = 'FR' } = req.query;
    
    const topTracks = await spotifyRequest(req, 'GET', 
      `/artists/${id}/top-tracks?country=${country}`);
    
    res.json({
      tracks: topTracks.tracks.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(artist => ({
          id: artist.id,
          name: artist.name
        })),
        album: {
          id: track.album.id,
          name: track.album.name,
          images: track.album.images
        },
        duration_ms: track.duration_ms,
        preview_url: track.preview_url,
        uri: track.uri,
        popularity: track.popularity
      }))
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération des top tracks:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;