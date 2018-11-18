const path = require( 'path' );
const fs = require( 'fs' );
const os = require( 'os' );
const { execFileSync } = require( 'child_process' );

const archiver = require( 'archiver' );

const version = require( '../package' ).version;

if ( process.platform == 'win32' )
  packageWin32( process.env.npm_config_arch || process.arch );
else if ( process.platform == 'darwin' )
  packageDarwin();
else
  package();

function packageWin32( arch ) {
  const { findVisualStudio } = require( './win32-utils' );

  console.log( 'Creating package for win32-' + arch );

  const vsPath = findVisualStudio();

  const vcToolsVersion = fs.readFileSync( path.join( vsPath, 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt' ), { encoding: 'utf8' } ).trim();

  let vcToolsArch;
  let ucrtArch;
  if ( arch == 'ia32' ) {
    vcToolsArch = 'HostX86/x86';
    ucrtArch = 'x86';
  } else if ( arch == 'x64' ) {
    vcToolsArch = 'HostX64/x64';
    ucrtArch = 'x64';
  } else {
    console.error( 'Error: Unknown architecture ' + arch );
    process.exit( 1 );
  }

  const vcToolsDir = path.join( vsPath, 'VC/Tools/MSVC/' + vcToolsVersion + '/bin/' + vcToolsArch );

  const ucrtDir = 'C:\\Program Files (x86)\\Windows Kits\\10\\Redist\\ucrt\\DLLs\\' + ucrtArch;

  const packagesDir = path.join( __dirname, '../packages' );

  if ( !fs.existsSync( packagesDir ) )
    fs.mkdirSync( packagesDir );

  const zipFile = path.join( packagesDir, 'launchui-v' + version + '-win32-' + arch + '.zip' );
  const output = fs.createWriteStream( zipFile );
  output.once( 'close', () => create7zArchive( zipFile ) );
  const archive = archiver( 'zip', { zlib: { level: 9 } } );

  archive.pipe( output );

  archive.file( path.join( __dirname, '../build/launchui.exe' ), { name: 'launchui.exe' } );
  archive.file( path.join( __dirname, '../deps/node/Release/node.dll' ), { name: 'node.dll' } );
  archive.file( path.join( __dirname, '../deps/libui/build/out/libui.dll' ), { name: 'libui.dll' } );

  archive.file( path.join( vcToolsDir, 'msvcp140.dll' ), { name: 'msvcp140.dll' } );
  archive.file( path.join( vcToolsDir, 'vcruntime140.dll' ), { name: 'vcruntime140.dll' } );

  archive.glob( '*.dll', { cwd: ucrtDir } );

  packageCommon( archive, '' );

  archive.finalize();
}

function packageDarwin() {
  const { getNodeModuleVersion } = require( './utils' );

  console.log( 'Creating package for darwin-' + process.arch );

  const nodeVersion = getNodeModuleVersion();

  const packagesDir = path.join( __dirname, '../packages' );

  if ( !fs.existsSync( packagesDir ) )
    fs.mkdirSync( packagesDir );

  const zipFile = path.join( packagesDir, 'launchui-v' + version + '-darwin-' + process.arch + '.zip' );

  const output = fs.createWriteStream( zipFile );
  output.once( 'close', () => create7zArchive( zipFile ) );
  const archive = archiver( 'zip', { zlib: { level: 9 } } );

  archive.pipe( output );

  const contentsDir = 'launchui.app/Contents/';

  archive.file( path.join( __dirname, '../src/Info.plist' ), { name: contentsDir + 'Info.plist' } );

  const macosDir = contentsDir + 'MacOS/';

  archive.file( path.join( __dirname, '../build/launchui' ), { name: macosDir + 'launchui' } );
  archive.file( path.join( __dirname, '../deps/node/out/Release/libnode.' + nodeVersion + '.dylib' ), { name: macosDir + 'libnode.' + nodeVersion + '.dylib' } );
  archive.file( path.join( __dirname, '../deps/libui/build/out/libui.A.dylib' ), { name: macosDir + 'libui.A.dylib' } );

  const resourcesDir = contentsDir + 'Resources/';

  archive.file( path.join( __dirname, '../src/launchui.icns' ), { name: resourcesDir + 'launchui.icns' } );

  packageCommon( archive, resourcesDir );

  archive.finalize();
}

function package() {
  const { getNodeModuleVersion } = require( './utils' );

  console.log( 'Creating package for ' + process.platform + '-' + process.arch );

  const nodeVersion = getNodeModuleVersion();

  const packagesDir = path.join( __dirname, '../packages' );

  if ( !fs.existsSync( packagesDir ) )
    fs.mkdirSync( packagesDir );

  const zipFile = path.join( packagesDir, 'launchui-v' + version + '-' + process.platform + '-' + process.arch + '.zip' );

  const output = fs.createWriteStream( zipFile );
  output.once( 'close', () => create7zArchive( zipFile ) );
  const archive = archiver( 'zip', { zlib: { level: 9 } } );

  archive.pipe( output );

  archive.file( path.join( __dirname, '../build/launchui' ), { name: 'launchui' } );
  archive.file( path.join( __dirname, '../deps/node/out/Release/lib.target/libnode.so.' + nodeVersion ), { name: 'libnode.so.' + nodeVersion } );
  archive.file( path.join( __dirname, '../deps/libui/build/out/libui.so.0' ), { name: 'libui.so.0' } );

  packageCommon( archive, '' );

  archive.finalize();
}

function packageCommon( archive, prefix ) {
  archive.file( path.join( __dirname, '../deps/node/LICENSE' ), { name: 'LICENSE.node' } );
  archive.file( path.join( __dirname, '../deps/libui/LICENSE' ), { name: 'LICENSE.libui' } );
  archive.file( path.join( __dirname, '../LICENSE' ), { name: 'LICENSE.launchui' } );

  [ 'package.json', 'readme.md', 'license', 'index.js', 'nbind.node' ].forEach( name => {
    archive.file( path.join( __dirname, '../deps/libui-node/' + name ), { name: prefix + 'node_modules/libui-node/' + name } );
  } );

  [ 'package.json', 'README.md', 'LICENSE' ].forEach( name => {
    archive.file( path.join( __dirname, '../node_modules/@mischnic/async-hooks/' + name ), { name: prefix + 'node_modules/@mischnic/async-hooks/' + name } );
  } );

  archive.glob( '**/*.js', { cwd: path.join( __dirname, '../node_modules/@mischnic/async-hooks/' ) }, { prefix: prefix + 'node_modules/@mischnic/async-hooks/' } );

  [ 'package.json', 'README.md', 'LICENSE', 'es6-shim.js' ].forEach( name => {
    archive.file( path.join( __dirname, '../node_modules/es6-shim/' + name ), { name: prefix + 'node_modules/es6-shim/' + name } );
  } );

  [ 'package.json', 'README.md', 'LICENSE', 'dist/nbind.js' ].forEach( name => {
    archive.file( path.join( __dirname, '../node_modules/nbind/' + name ), { name: prefix + 'node_modules/nbind/' + name } );
  } );

  archive.file( path.join( __dirname, '../app/main.js' ), { name: prefix + 'app/main.js' } );
}

function create7zArchive( zipFile ) {
  try {
    execFileSync( '7za', [ 'i' ])
  } catch ( e ) {
    if ( e.code !== "ENOENT" ) {
      throw e
    }
    console.log( '7zip not installed, 7z package not created' );
  }

  const sevenZipFile = zipFile.substring( 0, zipFile.length - '.zip'.length ) + '.7z' ;
  console.log( `Creating ${sevenZipFile}` );

  try {
    fs.unlinkSync( sevenZipFile );
  } catch ( e ) {
    if ( e.code !== "ENOENT" ) {
      throw e
    }
  }

  const tempDir = fs.mkdtempSync( path.join( os.tmpdir(), 'launchui-stage-' ) );
  try {
    // on Windows 7za is not in PATH
    const sevenZipExecutable = '7z';
    execFileSync( sevenZipExecutable, [ 'x', zipFile ], {
      cwd: tempDir
    } );
    execFileSync( sevenZipExecutable, [ 'a', '-m0=lzma2', '-mx=9', '-mfb=64', '-md=256m', '-ms=on', sevenZipFile, '.' ], {
      cwd: tempDir
    });
  }
  finally {
    execFileSync( "rm", [ "-rf", tempDir ] )
  }
}
