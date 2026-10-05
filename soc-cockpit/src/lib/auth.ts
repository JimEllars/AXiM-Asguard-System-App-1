import { cookies } from 'next/headers';

export async function verifyPassportAuth() {
    const cookieStore = await cookies();
    const token = cookieStore.get('axim_session')?.value;

    if (!token) return { isAuthenticated: false, user: null };

    try {
        const res = await fetch('https://passport.axim.us.com/api/v1/auth/verify-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        if (!res.ok) return { isAuthenticated: false, user: null };
        const data = await res.json();

        let isSuperUser = data.role === 'super_user';
        if (data.email === 'james.ellars@axim.us.com' || data.email === 'jrellars@gmail.com') {
            isSuperUser = true;
        }

        return {
            isAuthenticated: true,
            user: { ...data, isSuperUser }
        };
    } catch (e) {
        return { isAuthenticated: false, user: null };
    }
}
