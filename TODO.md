# TODO - Fix production OAuth redirect/login flow

- [ ] Inspect OAuth URL construction + environment variables used for portal URL/appId/redirectUri.
- [ ] Remove hardcoded/incorrect localhost behavior: ensure production uses the real OAuth portal host and correct redirectUri/state.
- [ ] Ensure callback handling redirects to the correct frontend origin in production.
- [ ] Add/adjust environment variable docs (.env.example) if needed.
- [ ] Verify by running dev build and checking generated login URL.

