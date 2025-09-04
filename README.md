# SpootifyWeb

Interface web moderne pour contrôler Spotify - Une application web élégante qui vous permet de contrôler votre musique Spotify depuis votre navigateur.

## ✨ Fonctionnalités

- 🎵 **Contrôle complet du lecteur** : Play, pause, suivant, précédent, volume, shuffle, repeat
- 🔍 **Recherche avancée** : Recherchez des pistes, artistes, albums et playlists
- 📱 **Interface responsive** : Fonctionne parfaitement sur desktop et mobile
- 🎨 **Design moderne** : Interface inspirée de Spotify avec animations fluides
- 📋 **Gestion des playlists** : Visualisez et jouez vos playlists
- 🔄 **Mises à jour en temps réel** : Synchronisation automatique avec Spotify
- 🎛️ **Gestion des appareils** : Transférez la lecture entre vos appareils

## 🚀 Installation

### Prérequis

- Node.js (version 14 ou supérieure)
- Un compte Spotify Premium (requis pour l'API Spotify Web Playback)
- Une application Spotify Developer

### Configuration Spotify Developer

1. Allez sur [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Créez une nouvelle application
3. Notez votre `Client ID` et `Client Secret`
4. Ajoutez `http://localhost:3000/auth/callback` dans les **Redirect URIs**

### Installation du projet

1. **Clonez le projet**
   ```bash
   git clone <votre-repo>
   cd SpootifyCLI
   ```

2. **Installez les dépendances**
   ```bash
   npm install
   ```

3. **Configuration des variables d'environnement**
   ```bash
   cp .env.example .env
   ```
   
   Éditez le fichier `.env` avec vos informations :
   ```env
   SPOTIFY_CLIENT_ID=votre_client_id_spotify
   SPOTIFY_CLIENT_SECRET=votre_client_secret_spotify
   SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/callback
   PORT=3000
   SESSION_SECRET=une_cle_secrete_aleatoire_securisee
   ```

4. **Démarrez l'application**
   ```bash
   npm start
   ```

5. **Ouvrez votre navigateur**
   
   Allez sur `http://localhost:3000`

## 🎯 Utilisation

### Première connexion

1. Cliquez sur "Se connecter avec Spotify"
2. Autorisez l'application à accéder à votre compte Spotify
3. Vous serez redirigé vers le tableau de bord

### Interface principale

- **Lecteur** : Contrôlez votre musique avec les boutons de lecture
- **Recherche** : Utilisez la barre de recherche pour trouver du contenu
- **Playlists** : Parcourez et jouez vos playlists
- **Appareils** : Gérez vos appareils Spotify dans la barre latérale

### Raccourcis clavier

- `Espace` : Play/Pause
- `←` : Piste précédente
- `→` : Piste suivante
- `↑/↓` : Contrôle du volume

## 🛠️ Développement

### Structure du projet

```
SpootifyCLI/
├── server.js              # Serveur Express principal
├── routes/                # Routes de l'API
│   ├── auth.js           # Authentification Spotify
│   ├── player.js         # Contrôles du lecteur
│   ├── search.js         # Recherche de musique
│   └── playlists.js      # Gestion des playlists
├── views/                # Templates EJS
│   ├── login.ejs         # Page de connexion
│   ├── dashboard.ejs     # Interface principale
│   └── error.ejs         # Page d'erreur
├── public/               # Fichiers statiques
│   ├── css/
│   │   └── style.css     # Styles CSS
│   └── js/
│       └── app.js        # JavaScript client
└── package.json          # Configuration npm
```

### Scripts disponibles

- `npm start` : Démarre l'application en production
- `npm run dev` : Démarre en mode développement avec nodemon
- `npm test` : Lance les tests (à implémenter)

### API Endpoints

#### Authentification
- `GET /auth/login` : Initie la connexion Spotify
- `GET /auth/callback` : Callback OAuth Spotify
- `POST /auth/refresh` : Rafraîchit le token d'accès

#### Lecteur
- `GET /api/player/status` : Statut de lecture actuel
- `POST /api/player/play` : Démarre la lecture
- `POST /api/player/pause` : Met en pause
- `POST /api/player/next` : Piste suivante
- `POST /api/player/previous` : Piste précédente
- `POST /api/player/volume` : Contrôle du volume
- `POST /api/player/shuffle` : Mode aléatoire
- `POST /api/player/repeat` : Mode répétition
- `POST /api/player/seek` : Déplacement dans la piste

#### Recherche
- `GET /api/search` : Recherche de contenu
- `GET /api/search/suggestions` : Suggestions de recherche

#### Playlists
- `GET /api/playlists` : Liste des playlists
- `POST /api/playlists/create` : Créer une playlist

## 🔧 Configuration avancée

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|---------|
| `SPOTIFY_CLIENT_ID` | ID client Spotify | - |
| `SPOTIFY_CLIENT_SECRET` | Secret client Spotify | - |
| `SPOTIFY_REDIRECT_URI` | URI de redirection | `http://localhost:3000/auth/callback` |
| `PORT` | Port du serveur | `3000` |
| `NODE_ENV` | Environnement | `development` |
| `SESSION_SECRET` | Clé secrète des sessions | - |

### Permissions Spotify requises

L'application demande les permissions suivantes :
- `user-read-playback-state` : Lire l'état de lecture
- `user-modify-playback-state` : Contrôler la lecture
- `user-read-currently-playing` : Piste en cours
- `playlist-read-private` : Lire les playlists privées
- `playlist-read-collaborative` : Lire les playlists collaboratives
- `playlist-modify-public` : Modifier les playlists publiques
- `playlist-modify-private` : Modifier les playlists privées
- `user-library-read` : Lire la bibliothèque
- `user-library-modify` : Modifier la bibliothèque

## 🐛 Dépannage

### Problèmes courants

**"No active device found"**
- Assurez-vous qu'un appareil Spotify est actif
- Ouvrez Spotify sur votre téléphone/ordinateur
- Lancez une piste pour activer l'appareil

**Erreur d'authentification**
- Vérifiez vos `CLIENT_ID` et `CLIENT_SECRET`
- Assurez-vous que l'URI de redirection est correcte
- Vérifiez que votre application Spotify est configurée correctement

**L'interface ne se met pas à jour**
- Actualisez la page
- Vérifiez la connexion WebSocket dans les outils de développement
- Redémarrez l'application

## 📝 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :

1. Fork le projet
2. Créer une branche pour votre fonctionnalité
3. Commiter vos changements
4. Pousser vers la branche
5. Ouvrir une Pull Request

## 📞 Support

Si vous rencontrez des problèmes :

1. Consultez la section [Dépannage](#-dépannage)
2. Vérifiez les [issues existantes](https://github.com/votre-repo/issues)
3. Créez une nouvelle issue si nécessaire

---

**Profitez de votre musique ! 🎵**