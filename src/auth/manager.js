const express = require('express');
const open = require('open');
const chalk = require('chalk');
const ora = require('ora');
const crypto = require('crypto');
const axios = require('axios');

class AuthManager {
  constructor(config) {
    this.config = config;
    this.clientId = process.env.SPOTIFY_CLIENT_ID || config.get('clientId');
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || config.get('clientSecret');
    this.redirectUri = 'http://localhost:8888/callback';
    this.scopes = [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-library-read',
      'user-top-read'
    ];
  }

  async authenticate() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        'Client ID et Client Secret requis. Configurez-les avec:\n' +
        'export SPOTIFY_CLIENT_ID="votre_client_id"\n' +
        'export SPOTIFY_CLIENT_SECRET="votre_client_secret"\n\n' +
        'Ou créez une application sur https://developer.spotify.com/dashboard'
      );
    }

    const existingToken = this.config.get('accessToken');
    const refreshToken = this.config.get('refreshToken');
    
    if (existingToken && refreshToken) {
      try {
        await this.refreshAccessToken();
        return;
      } catch (error) {
        console.log(chalk.yellow('Token expiré, nouvelle authentification requise...'));
      }
    }

    await this.performOAuthFlow();
  }

  async performOAuthFlow() {
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const authUrl = 'https://accounts.spotify.com/authorize?' +
      new URLSearchParams({
        response_type: 'code',
        client_id: this.clientId,
        scope: this.scopes.join(' '),
        redirect_uri: this.redirectUri,
        state: state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
      });

    const spinner = ora('Ouverture du navigateur pour l\'authentification...').start();
    
    return new Promise((resolve, reject) => {
      const app = express();
      const server = app.listen(8888);

      app.get('/callback', async (req, res) => {
        const { code, state: returnedState, error } = req.query;

        if (error) {
          spinner.fail('Authentification annulée');
          res.send('<h1>Authentification annulée</h1><p>Vous pouvez fermer cette fenêtre.</p>');
          server.close();
          reject(new Error(`Erreur d'authentification: ${error}`));
          return;
        }

        if (returnedState !== state) {
          spinner.fail('Erreur de sécurité');
          res.send('<h1>Erreur de sécurité</h1><p>Vous pouvez fermer cette fenêtre.</p>');
          server.close();
          reject(new Error('État de sécurité invalide'));
          return;
        }

        try {
          await this.exchangeCodeForTokens(code, codeVerifier);
          spinner.succeed('Authentification réussie!');
          res.send(`
            <h1 style="color: green;">✓ Authentification réussie!</h1>
            <p>Vous pouvez maintenant fermer cette fenêtre et retourner au terminal.</p>
            <script>setTimeout(() => window.close(), 3000);</script>
          `);
          server.close();
          resolve();
        } catch (error) {
          spinner.fail('Erreur lors de l\'échange de tokens');
          res.send('<h1>Erreur</h1><p>Erreur lors de l\'authentification. Vous pouvez fermer cette fenêtre.</p>');
          server.close();
          reject(error);
        }
      });

      // Ouvrir le navigateur
      open(authUrl).catch(() => {
        spinner.warn('Impossible d\'ouvrir le navigateur automatiquement');
        console.log(chalk.cyan('\nOuvrez manuellement cette URL dans votre navigateur:'));
        console.log(chalk.underline(authUrl));
      });

      // Timeout après 5 minutes
      setTimeout(() => {
        spinner.fail('Timeout d\'authentification');
        server.close();
        reject(new Error('Timeout d\'authentification (5 minutes)'));
      }, 300000);
    });
  }

  async exchangeCodeForTokens(code, codeVerifier) {
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          code_verifier: codeVerifier
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      
      this.config.set('accessToken', access_token);
      this.config.set('refreshToken', refresh_token);
      this.config.set('tokenExpiry', Date.now() + (expires_in * 1000));
      
    } catch (error) {
      throw new Error(`Erreur lors de l'échange de tokens: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async refreshAccessToken() {
    const refreshToken = this.config.get('refreshToken');
    
    if (!refreshToken) {
      throw new Error('Aucun refresh token disponible');
    }

    try {
      const response = await axios.post('https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.clientId
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, expires_in, refresh_token: newRefreshToken } = response.data;
      
      this.config.set('accessToken', access_token);
      this.config.set('tokenExpiry', Date.now() + (expires_in * 1000));
      
      if (newRefreshToken) {
        this.config.set('refreshToken', newRefreshToken);
      }
      
    } catch (error) {
      throw new Error(`Erreur lors du rafraîchissement du token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async getValidAccessToken() {
    const token = this.config.get('accessToken');
    const expiry = this.config.get('tokenExpiry');
    
    if (!token) {
      throw new Error('Aucun token d\'accès. Exécutez \'spootify auth\' d\'abord.');
    }
    
    // Rafraîchir le token s'il expire dans moins de 5 minutes
    if (expiry && Date.now() > (expiry - 300000)) {
      await this.refreshAccessToken();
      return this.config.get('accessToken');
    }
    
    return token;
  }

  isAuthenticated() {
    return !!this.config.get('accessToken');
  }

  logout() {
    this.config.delete('accessToken');
    this.config.delete('refreshToken');
    this.config.delete('tokenExpiry');
  }
}

module.exports = AuthManager;