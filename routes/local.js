const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const mm = require('music-metadata');
const authRouter = require('./auth');

// Configuration multer pour l'upload de fichiers audio
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'music');
    // Créer le dossier s'il n'existe pas
    fs.mkdir(uploadDir, { recursive: true }).then(() => {
      cb(null, uploadDir);
    }).catch(err => cb(err));
  },
  filename: function (req, file, cb) {
    // Garder le nom original avec timestamp pour éviter les conflits
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  // Accepter seulement les fichiers audio
  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/flac', 'audio/ogg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non supporté. Utilisez MP3, WAV, FLAC ou OGG.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

// Base de données simple en mémoire pour les fichiers locaux
let localLibrary = [];

// Charger la bibliothèque au démarrage
loadLocalLibrary();

async function loadLocalLibrary() {
  try {
    const musicDir = path.join(__dirname, '..', 'uploads', 'music');
    await fs.mkdir(musicDir, { recursive: true });
    
    const files = await fs.readdir(musicDir);
    localLibrary = [];
    
    for (const file of files) {
      const filePath = path.join(musicDir, file);
      try {
        const metadata = await mm.parseFile(filePath);
        const track = {
          id: `local_${Date.now()}_${Math.random()}`,
          name: metadata.common.title || path.parse(file).name,
          artist: metadata.common.artist || 'Artiste inconnu',
          album: metadata.common.album || 'Album inconnu',
          duration: metadata.format.duration ? Math.floor(metadata.format.duration * 1000) : 0,
          filePath: filePath,
          fileName: file,
          type: 'local',
          addedAt: new Date().toISOString()
        };
        localLibrary.push(track);
      } catch (err) {
        console.error(`Erreur lors de la lecture des métadonnées de ${file}:`, err);
      }
    }
    
    console.log(`📚 Bibliothèque locale chargée: ${localLibrary.length} pistes`);
  } catch (error) {
    console.error('Erreur lors du chargement de la bibliothèque locale:', error);
  }
}

// Routes

// Obtenir la bibliothèque locale
router.get('/library', authRouter.requireAuth, (req, res) => {
  res.json({
    tracks: localLibrary,
    total: localLibrary.length
  });
});

// Rechercher dans la bibliothèque locale
router.get('/search', authRouter.requireAuth, (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.json({ tracks: localLibrary });
  }
  
  const query = q.toLowerCase();
  const results = localLibrary.filter(track => 
    track.name.toLowerCase().includes(query) ||
    track.artist.toLowerCase().includes(query) ||
    track.album.toLowerCase().includes(query)
  );
  
  res.json({ tracks: results });
});

// Upload de nouveaux fichiers
router.post('/upload', authRouter.requireAuth, upload.array('audioFiles', 10), async (req, res) => {
  try {
    const uploadedTracks = [];
    
    for (const file of req.files) {
      try {
        const metadata = await mm.parseFile(file.path);
        const track = {
          id: `local_${Date.now()}_${Math.random()}`,
          name: metadata.common.title || path.parse(file.originalname).name,
          artist: metadata.common.artist || 'Artiste inconnu',
          album: metadata.common.album || 'Album inconnu',
          duration: metadata.format.duration ? Math.floor(metadata.format.duration * 1000) : 0,
          filePath: file.path,
          fileName: file.filename,
          type: 'local',
          addedAt: new Date().toISOString()
        };
        
        localLibrary.push(track);
        uploadedTracks.push(track);
      } catch (err) {
        console.error(`Erreur lors de la lecture des métadonnées de ${file.originalname}:`, err);
      }
    }
    
    res.json({
      success: true,
      message: `${uploadedTracks.length} fichier(s) ajouté(s) à la bibliothèque`,
      tracks: uploadedTracks
    });
  } catch (error) {
    console.error('Erreur lors de l\'upload:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload des fichiers' });
  }
});

// Obtenir les informations d'une piste spécifique
router.get('/tracks/:id', authRouter.requireAuth, (req, res) => {
  const track = localLibrary.find(t => t.id === req.params.id);
  
  if (!track) {
    return res.status(404).json({ error: 'Piste non trouvée' });
  }
  
  res.json({
    id: track.id,
    title: track.name,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    type: 'local',
    addedAt: track.addedAt
  });
});

// Servir les fichiers audio
router.get('/stream/:id', authRouter.requireAuth, (req, res) => {
  const track = localLibrary.find(t => t.id === req.params.id);
  
  if (!track) {
    return res.status(404).json({ error: 'Piste non trouvée' });
  }
  
  const filePath = track.filePath;
  
  // Vérifier que le fichier existe
  fs.access(filePath).then(() => {
    const stat = require('fs').statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      // Support du streaming avec range requests
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const file = require('fs').createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
      };
      
      res.writeHead(200, head);
      require('fs').createReadStream(filePath).pipe(res);
    }
  }).catch(() => {
    res.status(404).json({ error: 'Fichier non trouvé' });
  });
});

// Supprimer une piste
router.delete('/tracks/:id', authRouter.requireAuth, async (req, res) => {
  try {
    const trackIndex = localLibrary.findIndex(t => t.id === req.params.id);
    
    if (trackIndex === -1) {
      return res.status(404).json({ error: 'Piste non trouvée' });
    }
    
    const track = localLibrary[trackIndex];
    
    // Supprimer le fichier physique
    await fs.unlink(track.filePath);
    
    // Supprimer de la bibliothèque
    localLibrary.splice(trackIndex, 1);
    
    res.json({ success: true, message: 'Piste supprimée' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// Recharger la bibliothèque
router.post('/refresh', authRouter.requireAuth, async (req, res) => {
  try {
    await loadLocalLibrary();
    res.json({ 
      success: true, 
      message: 'Bibliothèque rechargée',
      total: localLibrary.length 
    });
  } catch (error) {
    console.error('Erreur lors du rechargement:', error);
    res.status(500).json({ error: 'Erreur lors du rechargement' });
  }
});

module.exports = router;
module.exports.localLibrary = localLibrary;