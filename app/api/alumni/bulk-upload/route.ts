import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSimplePassword } from '@/lib/utils/passwordGenerator';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AlumniUploadData {
  email: string;
  first_name: string;
  last_name: string;
  chapter: string;
  industry?: string;
  graduation_year?: number;
  company?: string;
  job_title?: string;
  phone?: string;
  location?: string;
  description?: string;
  pledge_class?: string;
  major?: string;
  hometown?: string;
}

export async function POST(request: NextRequest) {
  // API ROUTE CALLED!
  try {
    const { alumniData, options = {} } = await request.json();
    
    // Debug: Log the first few records to see what data we're receiving
    // Received alumni data sample
    
    const { 
      generatePasswords = true, 
      defaultPassword = 'Welcome2024!',
      sendWelcomeEmails = false,
      batchSize = 100 
    } = options;

    if (!Array.isArray(alumniData) || alumniData.length === 0) {
      return NextResponse.json({ 
        error: 'Invalid alumni data format' 
      }, { status: 400 });
    }

    // Starting bulk upload

    const results = {
      total: alumniData.length,
      successful: 0,
      failed: 0,
      errors: [] as any[],
      createdUsers: [] as any[],
      skipped: [] as any[]
    };

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < alumniData.length; i += batchSize) {
      const batch = alumniData.slice(i, i + batchSize);
      // Processing batch

      for (const alumni of batch) {
        try {
          const result = await processAlumniRecordSimple(alumni, {
            generatePasswords,
            defaultPassword,
            sendWelcomeEmails
          });

          if (result.success) {
            results.successful++;
            results.createdUsers.push({
              ...result.user,
              password: result.password,
              email: result.user?.email || alumni.email
            });
          } else {
            results.failed++;
            results.errors.push({
              email: alumni.email,
              error: result.error
            });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            email: alumni.email,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Small delay between batches to be respectful to Supabase
      if (i + batchSize < alumniData.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Bulk upload completed

    return NextResponse.json({
      success: true,
      results,
      message: `Bulk upload completed. ${results.successful} alumni created successfully.`
    });

  } catch (error) {
    console.error('❌ Bulk upload error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function processAlumniRecordSimple(
  alumniData: AlumniUploadData, 
  options: { generatePasswords: boolean; defaultPassword: string; sendWelcomeEmails: boolean }
) {
  try {
    const email = alumniData.email.toLowerCase();
    // Processing email

    // Step 1: Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('email', email)
      .maybeSingle(); // Use maybeSingle instead of single to avoid errors

    // Profile check result

    if (existingProfile) {
      // Profile already exists
      return { 
        success: true, 
        user: { id: existingProfile.id, email: existingProfile.email }, 
        action: 'already_exists' 
      };
    }

    // Step 2: Create auth user with retry logic
    const password = options.generatePasswords ? generateSimplePassword() : options.defaultPassword;
    
    let authUser = null;
    let authError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Auth creation attempt
        const { data: newUser, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: `${alumniData.first_name} ${alumniData.last_name}`,
            first_name: alumniData.first_name,
            last_name: alumniData.last_name,
            chapter: alumniData.chapter,
            role: 'alumni'
          }
        });

        // Auth creation result

        if (error) {
          if (error.message.includes('already registered') || error.message.includes('duplicate')) {
            // User already exists in auth, try to get their info
            // Checking for existing auth user
            const { data: existingUsers } = await supabase.auth.admin.listUsers();
            authUser = existingUsers.users.find(u => u.email === email);
            if (authUser) {
              // Auth user already exists
              
              // Check if this auth user already has a profile
              const { data: existingProfileForAuth } = await supabase
                .from('profiles')
                .select('id, email')
                .eq('id', authUser.id)
                .maybeSingle();
              
              if (existingProfileForAuth) {
                // Auth user already has profile
                return { 
                  success: true, 
                  user: { id: authUser.id, email: authUser.email }, 
                  action: 'already_exists' 
                };
              }
              break;
            }
          }
          authError = error;
          if (attempt < 3) {
            // Auth creation attempt failed, retrying...
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        } else {
          authUser = newUser.user;
          // Auth user created
          break;
        }
      } catch (error) {
        authError = error;
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }
    }

    if (!authUser) {
      throw new Error(`Auth creation failed after 3 attempts: ${authError}`);
    }

    // Step 3: Create or update profile
    // Creating/updating profile
    let profileCreated = false;
    
    // First, check if profile already exists
    const { data: existingProfileById } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('id', authUser.id)
      .maybeSingle();

    if (existingProfileById) {
      // Profile already exists for auth user ID
      profileCreated = true;
    } else {
      // Try to create new profile
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Profile creation attempt
          const chapterId = await getChapterIdFromName(supabase, alumniData.chapter);

          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: authUser.id,
              email,
              full_name: `${alumniData.first_name} ${alumniData.last_name}`,
              first_name: alumniData.first_name,
              last_name: alumniData.last_name,
              chapter: alumniData.chapter, // Use chapter name directly
              chapter_id: chapterId, // Look up UUID from name
              role: 'alumni',
              member_status: 'alumni',
              pledge_class: alumniData.pledge_class || null,
              grad_year: alumniData.graduation_year || null,
              major: alumniData.major || null,
              hometown: alumniData.hometown || null,
              bio: alumniData.description || null,
              phone: alumniData.phone || null,
              location: alumniData.location || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          // Profile creation result

          if (profileError) {
            console.error(`❌ Profile creation error:`, profileError);
            
            // If it's a duplicate key error, the profile already exists
            if (profileError.code === '23505' && profileError.message.includes('profiles_pkey')) {
              // Profile already exists (duplicate key), proceeding with update
              profileCreated = true;
              break;
            }
            
            if (attempt < 3) {
              // Profile creation attempt failed, retrying...
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }
            throw new Error(`Profile creation failed: ${profileError.message}`);
          }
          
          profileCreated = true;
          // Profile created successfully
          break;
        } catch (error) {
          console.error(`❌ Profile creation exception:`, error);
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw error;
        }
      }
    }

    if (!profileCreated) {
      throw new Error('Profile creation failed after 3 attempts');
    }

    // Step 4: Update profile with complete data from Excel file
    try {
      // Updating profile with complete data
      const chapterId = await getChapterIdFromName(supabase, alumniData.chapter);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          first_name: alumniData.first_name,
          last_name: alumniData.last_name,
          full_name: `${alumniData.first_name} ${alumniData.last_name}`,
          chapter: alumniData.chapter, // Use chapter name directly
          chapter_id: chapterId, // Look up UUID from name
          role: 'alumni',
          member_status: 'alumni',
          pledge_class: alumniData.pledge_class || null,
          grad_year: alumniData.graduation_year || null,
          major: alumniData.major || null,
          hometown: alumniData.hometown || null,
          bio: alumniData.description || null,
          phone: alumniData.phone || null,
          location: alumniData.location || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', authUser.id);

      if (updateError) {
        console.error(`❌ Profile update failed for ${email}:`, updateError);
      } else {
        // Profile updated with complete data
      }
    } catch (updateError) {
      console.error(`❌ Profile update exception for ${email}:`, updateError);
    }

    // Step 5: Create alumni record
    try {
      // Creating alumni record
      const chapterId = await getChapterIdFromName(supabase, alumniData.chapter);

      const { error: alumniError } = await supabase
        .from('alumni')
        .upsert({
          user_id: authUser.id,
          first_name: alumniData.first_name,
          last_name: alumniData.last_name,
          full_name: `${alumniData.first_name} ${alumniData.last_name}`,
          chapter: alumniData.chapter, // Use chapter name directly
          chapter_id: chapterId, // Look up UUID from name
          industry: alumniData.industry || 'Not specified',
          graduation_year: alumniData.graduation_year || new Date().getFullYear(),
          company: alumniData.company || 'Not specified',
          job_title: alumniData.job_title || 'Not specified',
          email,
          phone: alumniData.phone || null,
          location: alumniData.location || 'Not specified',
          description: alumniData.description || `Alumni from ${alumniData.chapter}`,
          avatar_url: null,
          verified: false,
          is_actively_hiring: false,
          last_contact: null,
          tags: null,
          mutual_connections: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id', // Handle conflicts on user_id
          ignoreDuplicates: false // Update if exists, insert if not
        });

      if (alumniError) {
        console.error(`❌ Alumni record creation failed for ${email}:`, alumniError);
      } else {
        // Alumni record created successfully
      }
    } catch (alumniError) {
      console.error(`❌ Alumni record creation exception for ${email}:`, alumniError);
    }

    // Successfully created complete profile and alumni record
    return { 
      success: true, 
      user: authUser, 
      password,
      action: 'created_new' 
    };

  } catch (error) {
    console.error(`❌ Failed to process alumni ${alumniData.email}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function getChapterIdFromName(supabase: any, chapterName: string): Promise<string | null> {
  const { data: chapter } = await supabase
    .from('spaces')
    .select('id')
    .eq('name', chapterName)
    .single();
  
  return chapter?.id || null;
}