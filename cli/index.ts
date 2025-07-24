#!/usr/bin/env node

import axios from 'axios';
import chalk from 'chalk';
import { Command } from 'commander';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import os from 'os';
import path from 'path';

const CONFIG_DIR = path.join(os.homedir(), '.secrets-manager');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
  apiUrl: string;
  tokens: { [projectName: string]: string };
}

class SecretsManager {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return fs.readJsonSync(CONFIG_FILE);
      }
    } catch (error) {
      // File doesn't exist or is invalid
      // TODO:
    }

    return {
      apiUrl: 'http://localhost:3000',
      tokens: {},
    };
  }

  private saveConfig() {
    fs.ensureDirSync(CONFIG_DIR);
    fs.writeJsonSync(CONFIG_FILE, this.config, { spaces: 2 });
  }

  async configure() {
    console.log(chalk.blue('🔧 Configuring Secrets Manager CLI'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiUrl',
        message: 'API URL:',
        default: this.config.apiUrl,
      },
    ]);

    this.config.apiUrl = answers.apiUrl;
    this.saveConfig();

    console.log(chalk.green('✅ Configuration saved'));
  }

  async addToken() {
    console.log(chalk.blue('🔑 Adding access token'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name (for reference):',
        validate: (input) => input.length > 0 || 'Project name is required',
      },
      {
        type: 'password',
        name: 'token',
        message: 'Access token:',
        validate: (input) => input.length > 0 || 'Token is required',
      },
    ]);

    // Verify token works
    try {
      await axios.get(`${this.config.apiUrl}/api/secrets`, {
        headers: {
          Authorization: `Bearer ${answers.token}`,
        },
      });

      this.config.tokens[answers.projectName] = answers.token;
      this.saveConfig();

      console.log(
        chalk.green(`✅ Token for '${answers.projectName}' added successfully`)
      );
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log(chalk.red('❌ Invalid token'));
      } else {
        console.log(chalk.red('❌ Failed to verify token'));
      }
    }
  }

  async listTokens() {
    console.log(chalk.blue('📋 Configured tokens:'));

    if (Object.keys(this.config.tokens).length === 0) {
      console.log(
        chalk.yellow(
          'No tokens configured. Use "secrets-cli token add" to add one.'
        )
      );
      return;
    }

    for (const projectName of Object.keys(this.config.tokens)) {
      console.log(chalk.green(`  • ${projectName}`));
    }
  }

  async removeToken() {
    if (Object.keys(this.config.tokens).length === 0) {
      console.log(chalk.yellow('No tokens configured.'));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'projectName',
        message: 'Select token to remove:',
        choices: Object.keys(this.config.tokens),
      },
    ]);

    delete this.config.tokens[answers.projectName];
    this.saveConfig();

    console.log(chalk.green(`✅ Token for '${answers.projectName}' removed`));
  }

  async pullSecrets(projectName?: string, outputFile?: string) {
    let token: string;
    let selectedProject: string;

    if (projectName) {
      if (!this.config.tokens[projectName]) {
        console.log(
          chalk.red(`❌ No token found for project '${projectName}'`)
        );
        return;
      }
      token = this.config.tokens[projectName];
      selectedProject = projectName;
    } else {
      const projectNames = Object.keys(this.config.tokens);

      if (projectNames.length === 0) {
        console.log(
          chalk.yellow(
            'No tokens configured. Use "secrets-cli token add" to add one.'
          )
        );
        return;
      }

      if (projectNames.length === 1) {
        selectedProject = projectNames[0];
        token = this.config.tokens[selectedProject];
      } else {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'projectName',
            message: 'Select project:',
            choices: projectNames,
          },
        ]);
        selectedProject = answers.projectName;
        token = this.config.tokens[selectedProject];
      }
    }

    try {
      console.log(chalk.blue(`📥 Pulling secrets for '${selectedProject}'...`));

      const response = await axios.get(`${this.config.apiUrl}/api/secrets`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const secrets = response.data.secrets;
      const envContent = Object.entries(secrets)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const filename = outputFile || '.env';

      // Backup existing .env file
      if (fs.existsSync(filename)) {
        const backupName = `${filename}.backup.${Date.now()}`;
        fs.copySync(filename, backupName);
        console.log(
          chalk.yellow(`📋 Existing ${filename} backed up as ${backupName}`)
        );
      }

      fs.writeFileSync(filename, envContent);

      const secretCount = Object.keys(secrets).length;
      console.log(
        chalk.green(`✅ ${secretCount} secrets written to ${filename}`)
      );

      // Show preview
      console.log(chalk.dim('\nPreview:'));
      Object.keys(secrets).forEach((key) => {
        console.log(chalk.dim(`  ${key}=***`));
      });
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log(chalk.red('❌ Invalid or expired token'));
      } else {
        console.log(chalk.red(`❌ Failed to pull secrets: ${error.message}`));
      }
    }
  }

  async status() {
    console.log(chalk.blue('📊 Secrets Manager CLI Status'));
    console.log(`API URL: ${this.config.apiUrl}`);
    console.log(`Config file: ${CONFIG_FILE}`);
    console.log(`Configured tokens: ${Object.keys(this.config.tokens).length}`);

    // Test API connection
    try {
      await axios.get(`${this.config.apiUrl}/health`);
      console.log(chalk.green('✅ API connection: OK'));
    } catch (error) {
      console.log(chalk.red('❌ API connection: Failed'));
    }
  }
}

const program = new Command();
const sm = new SecretsManager();

program
  .name('secrets-cli')
  .description('CLI tool for managing environment secrets')
  .version('1.0.0');

program
  .command('configure')
  .description('Configure the CLI settings')
  .action(() => sm.configure());

const tokenCommand = program
  .command('token')
  .description('Manage access tokens');

tokenCommand
  .command('add')
  .description('Add a new access token')
  .action(() => sm.addToken());

tokenCommand
  .command('list')
  .description('List configured tokens')
  .action(() => sm.listTokens());

tokenCommand
  .command('remove')
  .description('Remove a token')
  .action(() => sm.removeToken());

program
  .command('pull')
  .description('Pull secrets and write to .env file')
  .option('-p, --project <name>', 'Project name')
  .option('-o, --output <file>', 'Output file (default: .env)')
  .action((options) => sm.pullSecrets(options.project, options.output));

program
  .command('status')
  .description('Show CLI status and connectivity')
  .action(() => sm.status());

program.parse();

export default SecretsManager;
