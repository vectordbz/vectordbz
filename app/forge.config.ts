import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'path';
import fs from 'fs';

const config: ForgeConfig = {
  packagerConfig: {
    // Enable ASAR packaging
    asar: true,
    // Executable name (must match package.json "name" for Linux compatibility)
    executableName: 'vectordbz',
    // Icon path: base name without extension, electron-packager adds .ico/.icns
    icon: path.join(__dirname, 'assets', 'icon', 'icon'),
    // Windows executable metadata - helps with proper icon embedding
    win32metadata: {
      FileDescription: 'VectorDBZ - Vector Databases GUI',
      ProductName: 'VectorDBZ',
      CompanyName: 'VectorDBZ',
    },
    // Include app-update.yml in resources (outside ASAR so electron-updater can find it)
    extraResource: (() => {
      const appUpdatePath = path.join(__dirname, 'app-update.yml');
      if (fs.existsSync(appUpdatePath)) {
        return [appUpdatePath];
      }
      console.warn('app-update.yml not found in app/.');
      return [];
    })(),
  },
  rebuildConfig: {},
  makers: [
    // Windows
    new MakerSquirrel({
      setupIcon: path.join(__dirname, 'assets', 'icon', 'icon.ico'),
    }),
    // macOS - icon is handled by packagerConfig.icon
    new MakerZIP({}, ['darwin']),
    // Linux
    new MakerDeb(
      {
        options: {
          name: 'vectordbz',
          bin: 'vectordbz',
          maintainer: 'Snir Kara <snirjka@gmail.com>',
          homepage: 'https://github.com/vectordbz/vectordbz',
          icon: path.join(__dirname, 'assets', 'icon', 'icon.png'),
        },
      },
      ['linux'],
    ),
    new MakerRpm(
      {
        options: {
          name: 'vectordbz',
          bin: 'vectordbz',
          icon: path.join(__dirname, 'assets', 'icon', 'icon.png'),
        },
      },
      ['linux'],
    ),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'vectordbz',
        name: 'vectordbz',
      },
      // Publish as stable releases (not prereleases) so auto-updater can find them
      prerelease: false,
      // Publish immediately (not as drafts) so auto-updater can access them
      draft: false,
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application.
    // Embedded ASAR integrity validation (and the OnlyLoadAppFromAsar fuse that
    // depends on it) is only supported on Windows and macOS. Enabling it on
    // Linux makes @electron/packager's "Finalizing package" step fail, so we
    // gate those two fuses on the build host platform (== target in our matrix).
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: process.platform !== 'linux',
      [FuseV1Options.OnlyLoadAppFromAsar]: process.platform !== 'linux',
    }),
  ],
};

export default config;
