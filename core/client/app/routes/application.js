import Ember from 'ember';
import AuthConfiguration from 'ember-simple-auth/configuration';
import ApplicationRouteMixin from 'ember-simple-auth/mixins/application-route-mixin';
import ShortcutsRoute from 'ghost/mixins/shortcuts-route';
import ctrlOrCmd from 'ghost/utils/ctrl-or-cmd';
import windowProxy from 'ghost/utils/window-proxy';

const {
    Route,
    inject: {service},
    run
} = Ember;

function K() {
    return this;
}

let shortcuts = {};

shortcuts.esc = {action: 'closeMenus', scope: 'all'};
shortcuts[`${ctrlOrCmd}+s`] = {action: 'save', scope: 'all'};

export default Route.extend(ApplicationRouteMixin, ShortcutsRoute, {
    shortcuts,

    config: service(),
    dropdown: service(),
    notifications: service(),

    afterModel(model, transition) {
        if (this.get('session.isAuthenticated')) {
            transition.send('loadServerNotifications');
        }
    },

    title(tokens) {
        return `${tokens.join(' - ')} - ${this.get('config.blogTitle')}`;
    },

    sessionAuthenticated() {
        if (this.get('session.skipAuthSuccessHandler')) {
            return;
        }

        this._super(...arguments);
        this.get('session.user').then((user) => {
            this.send('signedIn', user);
        });
    },

    sessionInvalidated() {
        run.scheduleOnce('routerTransitions', this, function () {
            this.send('authorizationFailed');
        });
    },

    actions: {
        openMobileMenu() {
            this.controller.set('showMobileMenu', true);
        },

        openSettingsMenu() {
            this.controller.set('showSettingsMenu', true);
        },

        closeMenus() {
            this.get('dropdown').closeDropdowns();
            this.controller.setProperties({
                showSettingsMenu: false,
                showMobileMenu: false
            });
        },

        didTransition() {
            this.send('closeMenus');
        },

        signedIn() {
            this.get('notifications').clearAll();
            this.send('loadServerNotifications', true);
            this.send('checkForOutdatedDesktopApp');
        },

        invalidateSession() {
            this.get('session').invalidate().catch((error) => {
                this.get('notifications').showAlert(error.message, {type: 'error', key: 'session.invalidate.failed'});
            });
        },

        authorizationFailed() {
            windowProxy.replaceLocation(AuthConfiguration.baseURL);
        },

        loadServerNotifications(isDelayed) {
            if (this.get('session.isAuthenticated')) {
                this.get('session.user').then((user) => {
                    if (!user.get('isAuthor') && !user.get('isEditor')) {
                        this.store.findAll('notification', {reload: true}).then((serverNotifications) => {
                            serverNotifications.forEach((notification) => {
                                this.get('notifications').handleNotification(notification, isDelayed);
                            });
                        });
                    }
                });
            }
        },

        toggleMarkdownHelpModal() {
            this.get('controller').toggleProperty('showMarkdownHelpModal');
        },

        checkForOutdatedDesktopApp() {
            // Check if the user is running an older version of Ghost Desktop
            // that needs to be manually updated
            // (yes, the desktop team is deeply ashamed of these lines 😢)
            let ua = navigator && navigator.userAgent ? navigator.userAgent : null;

            if (ua && ua.includes && ua.includes('ghost-desktop')) {
                let updateCheck = /ghost-desktop\/0\.((5\.0)|((4|2)\.0)|((3\.)(0|1)))/;
                let link = '<a href="https://dev.ghost.org/ghost-desktop-manual-update" target="_blank">click here</a>';
                let msg = `Your version of Ghost Desktop needs to be manually updated. Please ${link} to get started.`;

                if (updateCheck.test(ua)) {
                    this.get('notifications').showAlert(msg.htmlSafe(), {
                        type: 'upgrade',
                        key: 'desktop.manual.upgrade'
                    });
                }
            }
        },

        // noop default for unhandled save (used from shortcuts)
        save: K
    }
});
