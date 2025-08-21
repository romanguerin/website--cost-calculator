// TO DO LATER:
// https://chatgpt.com/g/g-p-68a4966ab3488191a4b672e6e0831d37/c/68a6e8cb-d3f4-8333-ad97-c7226cde965f?project_id=g-p-68a4966ab3488191a4b672e6e0831d37&owner_user_id=user-UI6L088RAp5vJhuqwxMAtBIe

// lib/supabase.ts
// import { createBrowserClient, createServerClient } from "@supabase/ssr";
// import { cookies } from "next/headers";

// export const createClientBrowser = () =>
//   createBrowserClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
//   );

// export const createClientServer = () => {
//   const cookieStore = cookies();
//   return createServerClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//     {
//       cookies: {
//         get: (name) => cookieStore.get(name)?.value,
//         set: (name, value, options) => cookieStore.set(name, value, options),
//         remove: (name, options) => cookieStore.set(name, "", { ...options, maxAge: 0 }),
//       },
//     }
//   );
// };
