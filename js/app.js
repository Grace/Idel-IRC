'use strict';

var app = angular.module('IdelApp', []);

app.controller('IdelController', function ($scope, $http, PortService, SettingsService, IRCService, InputService, ColorService, ModalService) {
  $scope.settings = SettingsService;
  $scope.irc = IRCService;
  $scope.port = PortService;

  $scope.$on('ui::input-box::send', function (ev, input) {
    InputService.parse(input.message);
  });
  
  $scope.$on('ui::channel-list::select', function (ev, args) {
    $scope.irc.setCurrentChannel(args.network, args.channel);
  });
  
  $scope.$watch('settings.get("theme.user-css")', function (val) {
    var css = document.getElementById('user-css');
    if (css) {
      document.body.removeChild(css);
    }

    if (!val)
      return;
    
    $http.get(val, { responseType: 'blob' }).success(function (response) {
      css = document.createElement('link');
      css.rel = 'stylesheet';
      css.type = 'text/css';
      css.href = window.webkitURL.createObjectURL(response);
      
      document.body.appendChild(css);
    });
  });

  $scope.irc.getStatusChannel().topic = _.str.sprintf('Welcome to %sidel IRC%s, type %s/help%s to begin.',
                                                      ColorService._white, ColorService.reset,
                                                      ColorService.green, ColorService.reset);
  
  $scope.$watch('settings.get("idel.firstrun")', function (firstrun) {
    if (firstrun) {
      ModalService.display('thanks');
      $scope.settings.set('idel.firstrun', false);
      $scope.settings.save();
    }
  });
});
