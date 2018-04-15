const fs = require("fs");
const tmp = require("tmp");
const path = require("path");
const solc = require("solc");
const assert = require("assert");
const compile = require("../index");
const CompilerProvider = require('../compilerProvider');

function waitSecond() {
  return new Promise((resolve, reject) => setTimeout(() => resolve(), 1250));
}

describe.only('CompilerProvider', function(){
  let provider;

  describe('getters', function(){

    before(() => provider = new CompilerProvider());

    it('getVersions: should return versions object', async function(){
      const list = await provider.getVersions();
      assert(list.releases !== undefined);
    });

    it('getVersionUrl: should return a url component', async function(){
      const list = await provider.getVersions();

      let input = '0.4.21';
      let expected = 'soljson-v0.4.21+commit.dfe3193c.js';

      location = await provider.getVersionUrl(input, list);
      assert(location === expected, 'Should locate by version');

      input = 'nightly.2018.4.12';
      expected = 'soljson-v0.4.22-nightly.2018.4.12+commit.c3dc67d0.js';

      location = await provider.getVersionUrl(input, list);
      assert(location === expected, 'Should locate by nightly');

      input = 'commit.c3dc67d0';
      expected = 'soljson-v0.4.22-nightly.2018.4.12+commit.c3dc67d0.js';

      location = await provider.getVersionUrl(input, list);
      assert(location === expected, 'Should locate by commit');

      input = '0.4.55.77-fantasy-solc';
      expected = null;

      location = await provider.getVersionUrl(input, list);
      assert(location === null, 'Should return null if not found')
    });

    it('getReleases: should return a `releases` object', async function(){
      const list = await provider.getVersions();
      const releases = await provider.getReleases();
      const firstSolc = "0.1.3-nightly.2015.9.25+commit.4457170"

      assert(releases.prereleases[0] === firstSolc, 'Should return prereleases');
      assert(releases.releases[0] === releases.latestRelease, 'Should return releases/latestRelease');
    });
  });

  describe('integration', function(){
    this.timeout(40000);
    let newPragmaSource;  // floating at ^0.4.21
    let oldPragmaSource;  // pinned at 0.4.15

    const options = {
      contracts_directory: '',
      solc: '',
      quiet: true,
    };

    before("get code", function() {
      const newPragma = fs.readFileSync(path.join(__dirname, "./sources/NewPragma.sol"), "utf-8");
      const oldPragmaPin = fs.readFileSync(path.join(__dirname, "./sources/OldPragmaPin.sol"), "utf-8");
      const oldPragmaFloat = fs.readFileSync(path.join(__dirname, "./sources/OldPragmaFloat.sol"), "utf-8");

      newPragmaSource = { "NewPragma.sol": newPragma};
      oldPragmaPinSource = { "OldPragmaPin.sol": oldPragmaPin};
      oldPragmaFloatSource = { "OldPragmaPin.sol": oldPragmaFloat};
    });

    it('compiles w/ default solc if no compiler specified (float)', function(done){
      options.compiler = { cache: false };

      compile(newPragmaSource, options, (err, result) => {
        assert(err == null);
        assert(result['NewPragma'].contract_name === 'NewPragma');
        done();
      });
    });

    it('compiles w/ remote solc when options specify release (pinned)', function(done){
      options.compiler = {
        cache: false,
        solc: "0.4.15"
      };

      compile(oldPragmaPinSource, options, (err, result) => {
        assert(err == null);
        assert(result['OldPragmaPin'].contract_name === 'OldPragmaPin');
        done();
      });
    });

    it('compiles w/ remote solc when options specify prerelease (float)', function(done){
      // An 0.4.16 prerelease for 0.4.15
      options.compiler = {
        cache: false,
        solc: "0.4.16-nightly.2017.8.9+commit.81887bc7"
      };

      compile(oldPragmaFloatSource, options, (err, result) => {
        assert(err == null);
        assert(result['OldPragmaFloat'].contract_name === 'OldPragmaFloat');
        done();
      });
    });

    it('errors when specified release does not exist', function(done){
      options.compiler = {
        cache: false,
        solc: "0.4.55.77-fantasy-solc"
      };

      compile(newPragmaSource, options, (err, result) => {
        assert(err.message.includes('Could not find compiler version'));
        done();
      });
    });

    it('compiles w/ local path solc when options specify path', function(done){
      const pathToSolc = path.join(__dirname, "../node_modules/solc/index.js");

      options.compiler = {
        cache: false,
        solc: pathToSolc
      };

      compile(newPragmaSource, options, (err, result) => {
        assert(err == null);
        assert(result['NewPragma'].contract_name === 'NewPragma');
        done();
      });
    });

    it('errors when specified path does not exist', function(done){
      const pathToSolc = path.join(__dirname, "../solidity-warehouse/solc/index.js");
      options.compiler = {
        cache: false,
        solc: pathToSolc
      };

      compile(newPragmaSource, options, (err, result) => {
        assert(err.message.includes('Could not find compiler at:'));
        done();
      });
    });

    it('caches releases and uses them if available', function(done){
      tmp.dir((err, dir) => {
        if(err) return done(err);

        const truffleCacheDir = dir + "/truffle/solc/cache/";
        const expectedCache = truffleCacheDir + 'soljson-v0.4.21+commit.dfe3193c.js';

        options.compiler = {
          cache: true,
          cachePath: truffleCacheDir,
          solc: "0.4.21"
        };

        // Run compiler, expecting solc to be downloaded and cached.
        compile(newPragmaSource, options, (err, result) => {
          assert(err === null);
          assert(fs.existsSync(expectedCache));

          // Get cached solc access time
          const initialAccessTime = fs.statSync(expectedCache).atime.getTime();

          // Wait a second and recompile, verifying that the cached solc
          // got accessed / ran ok.
          waitSecond().then(() => {

            compile(newPragmaSource, options, (err, result) => {
              const finalAccessTime = fs.statSync(expectedCache).atime.getTime();

              assert(err == null);
              assert(result['NewPragma'].contract_name === 'NewPragma');
              assert(initialAccessTime < finalAccessTime);
              done();
            });

          }).catch(done);
        });
      });
    });
  });
});









