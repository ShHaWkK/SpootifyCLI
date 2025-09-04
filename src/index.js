const { Command } = require('commander');
const chalk = require('chalk');
const SpotifyAPI = require('./spotify/api');
const AuthManager = require('./auth/manager');
const PlayerController = require('./player/controller');
const SearchController = require('./search/controller');
const PlaylistController = require('./playlist/controller');
const ConfigManager = require('./config/manager');

const program = new Command();
const config = new ConfigManager();
const authManager = new AuthManager(config);
const spotifyAPI = new SpotifyAPI(authManager);
const playerController = new PlayerController(spotifyAPI);
const searchController = new SearchController(spotifyAPI);
const playlistController = new PlaylistController(spotifyAPI);

program
  .name('spootify')
  .description('Client en ligne de commande pour Spotify')
  .version('1.0.0');

// Commande d'authentification
program
  .command('auth')
  .description('Authentification avec Spotify')
  .action(async () => {
    try {
      await authManager.authenticate();
      console.log(chalk.green('✓ Authentification réussie!'));
    } catch (error) {
      console.error(chalk.red('✗ Erreur d\'authentification:'), error.message);
    }
  });

// Commandes de contrôle de lecture
program
  .command('play [query]')
  .description('Lancer la lecture ou rechercher et jouer une chanson')
  .action(async (query) => {
    try {
      if (query) {
        await playerController.searchAndPlay(query);
      } else {
        await playerController.play();
      }
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

program
  .command('pause')
  .description('Mettre en pause la lecture')
  .action(async () => {
    try {
      await playerController.pause();
      console.log(chalk.yellow('⏸ Lecture mise en pause'));
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

program
  .command('next')
  .description('Passer à la chanson suivante')
  .action(async () => {
    try {
      await playerController.next();
      console.log(chalk.green('⏭ Chanson suivante'));
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

program
  .command('previous')
  .description('Revenir à la chanson précédente')
  .action(async () => {
    try {
      await playerController.previous();
      console.log(chalk.green('⏮ Chanson précédente'));
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

// Commande de statut
program
  .command('status')
  .description('Afficher le statut de lecture actuel')
  .action(async () => {
    try {
      await playerController.showStatus();
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

// Commandes de recherche
program
  .command('search <query>')
  .description('Rechercher des chansons, artistes ou albums')
  .option('-t, --type <type>', 'Type de recherche (track, artist, album)', 'track')
  .option('-l, --limit <limit>', 'Nombre de résultats', '10')
  .action(async (query, options) => {
    try {
      await searchController.search(query, options.type, parseInt(options.limit));
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

// Commandes de playlist
program
  .command('playlists')
  .description('Afficher vos playlists')
  .action(async () => {
    try {
      await playlistController.listPlaylists();
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

program
  .command('playlist <id>')
  .description('Afficher les chansons d\'une playlist')
  .action(async (id) => {
    try {
      await playlistController.showPlaylist(id);
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

// Commande de configuration
program
  .command('config')
  .description('Gérer la configuration')
  .option('--reset', 'Réinitialiser la configuration')
  .action(async (options) => {
    try {
      if (options.reset) {
        config.reset();
        console.log(chalk.green('✓ Configuration réinitialisée'));
      } else {
        config.show();
      }
    } catch (error) {
      console.error(chalk.red('✗ Erreur:'), error.message);
    }
  });

// Gestion des erreurs globales
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('✗ Erreur non gérée:'), error.message);
  process.exit(1);
});

program.parse();