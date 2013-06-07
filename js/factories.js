app.factory('LineSocket', function () {
  function lineSocket () {
    this._lineBuffer = '';
  };

  lineSocket.prototype.connect = function (host, port, onConnect, onMessage, onDisconnect) {
    var self = this;
    
    this._onConnect = onConnect;
    this._onMessage = onMessage;
    this._onDisconnect = onDisconnect;

    chrome.socket.create('tcp', {}, function (createInfo) {
      self._socket = createInfo.socketId;
      
      chrome.socket.connect(self._socket, host, parseInt(port), function (result) {
        console.log('Connect returned ' + result);
        self._onConnect();
        self.readLoop();
      });
    });
  };
  
  lineSocket.prototype.disconnect = function () {
    chrome.socket.disconnect(this._socket);
    chrome.socket.destroy(this._socket);
    this._onDisconnect();
  };
  
  lineSocket.prototype.readLoop = function () {
    var self = this;

    chrome.socket.read(this._socket, null, function (result) {
      console.log('Read: ' + result.resultCode);

      if (result.resultCode < 0)
        return;

      self._lineBuffer += self.arrayBufferToString(result.data);
      var parts = self._lineBuffer.split("\r\n");

      for (var i = 0; i < parts.length - 1; i++) {
        self._onMessage(parts[i]);
      }
      
      self._lineBuffer = parts[parts.length-1];

      self.readLoop();
    });
  };
  
  lineSocket.prototype.writeLine = function (line) {
    line += "\r\n";
    chrome.socket.write(this._socket, this.stringToArrayBuffer(line), function (result) {
      console.log('onWriteCompleteCallback: ' + result.bytesWritten);
    });
  };
  
  lineSocket.prototype.arrayBufferToString = function (buffer) {
    return String.fromCharCode.apply(String, new Uint8Array(buffer));
  };

  lineSocket.prototype.stringToArrayBuffer = function (string) {
    var buffer = new ArrayBuffer(string.length);
    var bufferView = new Uint8Array(buffer);
    for (var i = 0; i < string.length; i++) {
      bufferView[i] = string.charCodeAt(i);
    }
    return buffer;
  };

  return function () {
    return new lineSocket();
  };
});

app.factory('Network', function ($rootScope, LineSocket, Channel) {
  function network () {
    this.channels = [Channel('Status')];
  }
  
  network.prototype.connect = function () {
    this._socket = LineSocket();
    
    // FIXME should cycle through available servers
    var server = this.servers[0];
    var parts = server.split(':');

    this._socket.connect(parts[0], parts[1], this.onConnect.bind(this), this.onMessage.bind(this), this.onDisconnect.bind(this));
  };
  
  network.prototype.disconnect = function () {
    this.writeLine('QUIT :Bye');
    this._socket.disconnect();
  };
  
  network.prototype.writeLine = function (line) {
    this.channels[0].addLine('status', '> ' + line);
    this._socket.writeLine(line);
  };

  network.prototype.onConnect = function () {
    this.writeLine('NICK ' + this.nick);
    this.writeLine('USER ' + this.nick + ' * * :' + this.nick);
  };
  
  network.prototype.onMessage = function (line) {
    this.channels[0].addLine('status', '< ' + line);
    
    var parts = line.split(':');
    parts = _.map(parts, function (part) { return part.split(' '); });
    
    if (parts[0] === undefined)
      return;

    switch (parts[0][0]) {
      case '':
        switch (parts[1][1]) {
          case '353': // Names
            var channel = _.find(this.channels, {name: parts[1][4]});
            Array.prototype.push.apply(channel.nicks, parts[2]);
            break;

          case '375': // Beginning of MOTD
          case '372': // MOTD
            break;

          case '376': // End of MOTD
          case '422': // no idea
            this.joinChannels.forEach(function (channel) {
              this.writeLine('JOIN ' + channel);
            }.bind(this));
            break;
          
          case '433': // Nick in use
            this.writeLine('NICK ' + this.nick + '_');
            break;
          
          case 'MODE':
            break;
          
          case 'JOIN':
            this.channels.push(Channel(parts[2][0]));
            break;
          
          case 'PRIVMSG':
            var channel = _.find(this.channels, {name: parts[1][2]});
            channel.addLine(parts[1][0].split('!')[0], parts[2].join(' '));
            break;
        }
        break;

      case 'PING':
        this.writeLine('PONG :' + parts[1].join(' '));
        break;
      
      case 'ERROR':
        break;
    }

    $rootScope.$apply();
  };
  
  network.prototype.onDisconnect = function () {
    console.log('Disconnected.');
    // TODO Reconnect logic
  };

  return function (obj) {
    return _.assign(new network(), obj);
  };
});

app.factory('Channel', function (Message) {
  return function (name) {
    return {
      name: name,
      activity: false,
      topic: null,
      nicks: [],
      buffer: [],
      addLines: function (nick, messages, timestamp) {
        messages.forEach(function (line) {
          this.addLine(nick, line, timestamp);
        }.bind(this));
      },
      addLine: function (nick, message, timestamp) {
        var lines = message.split("\n");
        lines.forEach(function (line) {
          this.buffer.push(Message(timestamp || moment().unix(), nick, line));
        }.bind(this));
        this.activity = true;
      }
    };
  };
});

app.factory('Message', function () {
  return function (timestamp, nick, message) {
    return {
      timestamp: timestamp,
      nick: nick,
      message: message
    };
  };
});
