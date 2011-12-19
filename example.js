var zipstream = require('./zipstream');
var fs = require('fs');

var out = fs.createWriteStream('out.zip');
var zip = zipstream.createZip({ level: 1 });

zip.on('data', function(data) { out.write(data); });

zip.addEntry(fs.createReadStream('README.md'), { name: 'README.md' }, function() {
  zip.addEntry(fs.createReadStream('example.js'), { name: 'example.js'  }, function() {
    zip.finalize();
  });
});


