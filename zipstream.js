// written by Antoine van Wel (http://wellawaretech.com)

var zlib = require('zlib');
var fs = require('fs');
var assert = require('assert');
var stream = require('stream');
var util = require('util');

var crc32 = require('./crc32');


function ZipStream(opt) {
  var self = this;

  self.readable = true;
  self.paused = false;
  self.busy = false;
  self.eof = false;

  self.queue = [];
  self.fileptr = 0;
  self.files = [];
  self.options = opt;
}

util.inherits(ZipStream, stream.Stream);

exports.createZip = function(opt) {
  return new ZipStream(opt);
}

// converts datetime to DOS format
function convertDate(d) {
  var year = d.getFullYear();

  if (year < 1980) {
    return (1<<21) | (1<<16);
  }
  return ((year-1980) << 25) | ((d.getMonth()+1) << 21) | (d.getDate() << 16) | 
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
}


ZipStream.prototype.pause = function() {
  var self = this;
  self.paused = true;
}

ZipStream.prototype.resume = function() {
  var self = this;
  self.paused = false;

  self._read();
}

ZipStream.prototype.destroy = function() {
  var self = this;
  self.readable = false;
}

ZipStream.prototype._read = function() {
  var self = this;

  if (!self.readable || self.paused) { return; }

  if (self.queue.length > 0) {
    var data = self.queue.shift();
    self.emit('data', data);
  }

  if (self.eof && self.queue.length === 0) {
    self.emit('end');
    self.readable = false;

		if (self.callback) { 
			self.callback(self.fileptr); 
		}
  }

  process.nextTick(function() { self._read(); }); //TODO improve
}



ZipStream.prototype.finalize = function(callback) {
  var self = this;

  if (self.files.length === 0) { 
    emit('error', 'no files in zip');
    return;
  }

	self.callback = callback;
  self._pushCentralDirectory();
  self.eof = true;
}


ZipStream.prototype.addFile = function(source, file, callback) {
  var self = this;

  if (self.busy) {
    emit('error', 'previous file not finished');
    return;
  }

  self.busy = true;
  self.file = file;
  
  self._pushLocalFileHeader(file);

  var deflate = zlib.createDeflateRaw(self.options);
  var checksum = crc32.createCRC32();
  var uncompressed = 0;
  var compressed = 0;
  
  deflate.on('data', function(chunk) { 
    compressed += chunk.length;
    self.queue.push(chunk);
  });

  deflate.on('end', function() {
    file.crc32 = checksum.digest();
    file.compressed = compressed;
    file.uncompressed = uncompressed;

    self.fileptr += compressed;
    self._pushDataDescriptor(file);

    self.files.push(file);
    self.busy = false;
    callback();
  });

  source.on('data', function(data) {
    uncompressed += data.length;
    checksum.update(data);
    deflate.write(data); //TODO check for false & wait for drain
  });

  source.on('end', function() { 
    deflate.end(); 
  });

  process.nextTick(function() { self._read(); });
}

//Write a string directly to a file within the zipstream
ZipStream.prototype.addString = function(source, file, callback) {
  var self = this;

  if (self.busy) {
    emit('error', 'previous file not finished');
    return;
  }

  self.busy = true;
  self.file = file;
  
  self._pushLocalFileHeader(file);

  var deflate = zlib.createDeflateRaw(self.options);
  var checksum = crc32.createCRC32();
  var uncompressed = 0;
  var compressed = 0;
  
  deflate.on('data', function(chunk) { 
    compressed += chunk.length;
    self.queue.push(chunk);
  });

  deflate.on('end', function() {
    file.crc32 = checksum.digest();
    file.compressed = compressed;
    file.uncompressed = uncompressed;

    self.fileptr += compressed;
    self._pushDataDescriptor(file);

    self.files.push(file);
    self.busy = false;
    callback();
  });

  uncompressed += source.length;
  checksum.update(source);
  deflate.write(source); //TODO check for false & wait for drain
  deflate.end(); 

  process.nextTick(function() { self._read(); });
}


//TODO remove listeners on end


// local file header
ZipStream.prototype._pushLocalFileHeader = function(file) {
  var self = this;

  file.version = 20;
  file.bitflag = 8;
  file.method = 8;
  file.moddate = convertDate(new Date());
  file.offset = self.fileptr;

  var buf = new Buffer(30+file.name.length);

  buf.writeUInt32LE(0x04034b50, 0);         // local file header signature 
  buf.writeUInt16LE(file.version, 4);       // version needed to extract
  buf.writeUInt16LE(file.bitflag, 6);       // general purpose bit flag 
  buf.writeUInt16LE(file.method, 8);        // compression method  
  buf.writeUInt32LE(file.moddate, 10);      // last mod file date and time

  buf.writeInt32LE(0, 14);                  // crc32
  buf.writeUInt32LE(0, 18);                 // compressed size
  buf.writeUInt32LE(0, 22);                 // uncompressed size

  buf.writeUInt16LE(file.name.length, 26);  // file name length
  buf.writeUInt16LE(0, 28);                 // extra field length
  buf.write(file.name, 30);                 // file name

  self.queue.push(buf);
  self.fileptr += buf.length;
}

ZipStream.prototype._pushDataDescriptor = function(file) {
  var self = this;

  var buf = new Buffer(16);
  buf.writeUInt32LE(0x08074b50, 0);         // data descriptor record signature
  buf.writeInt32LE(file.crc32, 4);          // crc-32
  buf.writeUInt32LE(file.compressed, 8);    // compressed size
  buf.writeUInt32LE(file.uncompressed, 12); // uncompressed size

  self.queue.push(buf);
  self.fileptr += buf.length;
}

ZipStream.prototype._pushCentralDirectory = function() {
  var self = this;
  var cdoffset = self.fileptr;

  var buf = new Buffer(1024);
  var ptr = 0;
  var cdsize = 0;

  for (var i=0; i<self.files.length; i++) {
    var file = self.files[i];

    // central directory file header
    buf.writeUInt32LE(0x02014b50, ptr+0);         // central file header signature 
    buf.writeUInt16LE(file.version, ptr+4);       // TODO version made by 
    buf.writeUInt16LE(file.version, ptr+6);       // version needed to extract 
    buf.writeUInt16LE(file.bitflag, ptr+8);       // general purpose bit flag   
    buf.writeUInt16LE(file.method, ptr+10);       // compression method
    buf.writeUInt32LE(file.moddate, ptr+12);      // last mod file time and date
    buf.writeInt32LE(file.crc32, ptr+16);         // crc-32 
    buf.writeUInt32LE(file.compressed, ptr+20);   // compressed size  
    buf.writeUInt32LE(file.uncompressed, ptr+24); // uncompressed size  
    buf.writeUInt16LE(file.name.length, ptr+28);  // file name length
    buf.writeUInt16LE(0, ptr+30);                 // extra field length
    buf.writeUInt16LE(0, ptr+32);                 // file comment length
    buf.writeUInt16LE(0, ptr+34);                 // disk number where file starts
    buf.writeUInt16LE(0, ptr+36);                 // internal file attributes
    buf.writeUInt32LE(0, ptr+38);                 // external file attributes
    buf.writeUInt32LE(file.offset, ptr+42);       // relative offset
    buf.write(file.name, ptr+46);                 // file name

    ptr = ptr + 46 + file.name.length;
  }

  cdsize = ptr;
  
  // end of central directory record
  buf.writeUInt32LE(0x06054b50, ptr+0);           // end of central dir signature
  buf.writeUInt16LE(0, ptr+4);                    // number of this disk
  buf.writeUInt16LE(0, ptr+6);                    // disk where central directory starts
  buf.writeUInt16LE(self.files.length, ptr+8);    // number of central directory records on this disk
  buf.writeUInt16LE(self.files.length, ptr+10);   // total number of central directory records
  buf.writeUInt32LE(cdsize, ptr+12);              // size of central directory in bytes
  buf.writeUInt32LE(cdoffset, ptr+16);            // offset of start of central directory, relative to start of archive
  buf.writeUInt16LE(0, ptr+20);                   // comment length

  ptr = ptr + 22;

  self.queue.push(buf.slice(0, ptr));
	self.fileptr += ptr;
}
