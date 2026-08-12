/* =============================================================
   ASPRO CONSTRUCTION — SITE CONFIGURATION
   -------------------------------------------------------------
   This is the ONLY file you normally need to edit.
   Fill in the 3 values below (see DEPLOY-GUIDE.md, Steps 2 & 4).
   ============================================================= */

window.ASPRO_CONFIG = {

  /* 1. Your Supabase project URL.
     Find it in Supabase > Project Settings > Data API > Project URL
     Example: "https://abcd1234.supabase.co"                        */
  SUPABASE_URL: "https://hemsrzmgoczskwkolqgg.supabase.co",

  /* 2. Your Supabase "anon" public key (safe to expose in a website).
     Supabase > Project Settings > API Keys > anon / public         */
  SUPABASE_ANON_KEY: "sb_publishable_-8wkf-KYWY9rKmEqNFaCqg_JsqAe9ZG",

  /* 3. Your Web3Forms Access Key (routes the contact form to email).
     Get a free key at https://web3forms.com (enter YOUR email).    */
  WEB3FORMS_KEY: "0fd99110-4b92-421b-a9a5-040991080d8a",

  /* Company details shown around the site — edit freely. */
  COMPANY: {
    name:    "Aspro Construction",
    email:   "Pm@asprocorp.net",
    phone:   "845-751-1988",
    address: "Monsey, NY",
    hours:   "Mon – Fri: 9am – 5pm",
    region:  "Upstate NY",
    tagline: "Building dreams with precision throughout Upstate NY.",
    // Storage bucket where uploaded photos and videos live (created by the SQL script)
    imageBucket: "site-images",

    /* Largest video the admin panel will accept, in megabytes.
       Supabase caps uploads at 50 MB on the Free plan — raise this only if
       you've raised the limit in Supabase > Storage > Settings.            */
    maxVideoMB: 50
  }
};
