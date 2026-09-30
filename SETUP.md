# 26 Weeks: setup guide

The app works right now in "this device only" mode. These steps connect it to a database so Maya's phone and laptop share the same data.

## 1. Create the database (Supabase, free)
1. Go to supabase.com, sign up, and click **New project**.
   - Name: `26 Weeks`. Generate a database password and save it in your password manager. The app never uses it.
   - Region: whichever is closest to you.
2. When the project is ready, open **SQL Editor**, then **New query**. Paste in everything from `supabase/schema.sql` and press **Run**. It should say "Success."

## 2. Set up sign-in (email + password)
1. **Authentication → Users → Add user → Create new user**: enter Maya's email and a password she'll use, and tick "Auto confirm." Add yourself too if you want your own separate log.
2. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up." Now only the people you added can sign in.
3. **Authentication → URL Configuration**: once the site is on GitHub Pages, set **Site URL** to its address (e.g. `https://yourname.github.io/maya/`). The "Forgot password?" email link goes there.

**Why not emailed codes or magic links?** On an iPhone, an app saved to the home screen keeps its own sign-in, separate from Safari, so a link in an email signs her into Safari rather than the app. Showing a code in the email means editing the template, and Supabase's free plan only allows that with your own email service. A password avoids both problems, and she only types it once per device.

**Never delete her user once she's logging data.** Deleting a user also deletes all of her rows. To change a password, use "Forgot password?" in the app instead.

## 3. Connect the app to the database
1. Open **Project Settings → API Keys** (it may be under **Data API**).
2. Copy the **Project URL** and the **anon / publishable** key into `config.js`:
   ```js
   SUPABASE_URL: "https://xxxx.supabase.co",
   SUPABASE_ANON_KEY: "eyJ... or sb_publishable_...",
   ```
   This key is safe to put in a public website. It only lets people *try* to sign in. The row-level security rules in `schema.sql` make sure each person can only see their own rows. **Never** paste the `service_role` / secret key anywhere in this app.

## 4. Publish on GitHub Pages
Same as your other projects: push this folder to a GitHub repo, then **Settings → Pages → Deploy from branch → main / root**.

## 5. Install on Maya's phone
Open the GitHub Pages link in **Safari** → Share button → **Add to Home Screen**. Open it from the home screen and sign in with the emailed code. She stays signed in after that.

## Good to know
- **Free-plan pause:** Supabase pauses free projects after about a week with no activity. Daily use keeps it awake. If it ever pauses, click **Restore** in the Supabase dashboard; no data is lost.
- **Offline:** anything she logs without signal is saved on the phone and sent to the database when she's back online. The small text under the progress bar says "Synced" once it's through.
- **Publishing changes:** when you update the app, bump `VERSION` in `sw.js` (e.g. `w26-v2`) so phones pick up the new version.
- **Protein buttons and goal:** edit them in `config.js`.
