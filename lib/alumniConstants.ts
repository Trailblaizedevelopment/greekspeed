export interface Alumni {
  id: string; // This will be the user_id for connection functionality
  alumniId?: string; // Original alumni table ID
  firstName: string;
  lastName: string;
  fullName: string;
  chapter: string;
  industry: string;
  graduationYear: number;
  company: string;
  jobTitle: string;
  email: string | null;
  phone: string | null;
  is_email_public?: boolean;
  is_phone_public?: boolean;
  isEmailPublic?: boolean;  // camelCase version for API response
  isPhonePublic?: boolean;  // camelCase version for API response
  location: string;
  description: string;
  mutualConnections: MutualConnection[];
  mutualConnectionsCount: number;
  avatar?: string;
  verified?: boolean;
  isActivelyHiring?: boolean;
  lastContact?: string;
  tags: string[];
  hasProfile?: boolean;
}

export interface MutualConnection {
  id?: string; // Optional ID for React keys
  name: string;
  avatar?: string;
}

export const getGraduationYears = (): number[] => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];

  // Generate years from current year down to 2005
  const startYear = currentYear + 8;
  const endYear = 1950;

  for (let year = startYear; year >= endYear; year--) {
    years.push(year);
  }

  return years;
}

export const graduationYears = getGraduationYears();

export const getEarlierCutoffYear = (): number => {
  const years = getGraduationYears();
  return years[years.length - 1] - 1;
}

export const industries = [
  "Aerospace & Defense",
  "Agriculture",
  "Architecture & Planning",
  "Arts, Design & Entertainment",
  "Construction",
  "Consulting",
  "Education",
  "Energy & Utilities",
  "Engineering",
  "Finance",
  "Food & Beverage",
  "Government & Public Administration",
  "Healthcare",
  "Hospitality & Tourism",
  "Human Resources & Staffing",
  "Insurance",
  "Legal",
  "Manufacturing",
  "Marketing",
  "Media & Communications",
  "Non-profit",
  "Pharmaceuticals & Biotechnology",
  "Real Estate",
  "Retail & E-commerce",
  "Sales",
  "Technology",
  "Telecommunications",
  "Transportation & Logistics"
];

export const chapters = [
  "Sigma Chi",
  "Delta Gamma", 
  "Kappa Alpha",
  "Phi Mu",
  "Pi Kappa Alpha",
  "Alpha Delta Pi",
  "Sigma Nu",
  "Delta Delta Delta"
];

export const locations = [
  "Jackson, MS",
  "Oxford, MS", 
  "Atlanta, GA",
  "Dallas, TX",
  "Nashville, TN",
  "Birmingham, AL",
  "Memphis, TN",
  "New Orleans, LA"
]; 

export const majors = [
  "Accounting",
  "Actuarial Science",
  "Advertising",
  "Aerospace Engineering",
  "African Languages, Literatures, and Linguistics",
  "African Studies",
  "African-American Studies",
  "Agricultural Business and Management",
  "Agricultural Economics",
  "Agricultural Education",
  "Agricultural Engineering",
  "Agricultural Journalism",
  "Agricultural Mechanization",
  "Agricultural Sciences",
  "Agricultural Technology Management",
  "Agricultural/Biological Engineering and Bioengineering",
  "Agriculture",
  "Agronomy and Crop Science",
  "Air Traffic Control",
  "American History",
  "American Literature",
  "American Sign Language",
  "American Studies",
  "Anatomy",
  "Ancient Studies",
  "Animal Behavior and Ethology",
  "Animal Science",
  "Animation and Special Effects",
  "Anthropology",
  "Applied Mathematics",
  "Aquaculture",
  "Aquatic Biology",
  "Arabic",
  "Archeology",
  "Architectural Engineering",
  "Architectural History",
  "Architecture",
  "Art",
  "Art Education",
  "Art History",
  "Art Therapy",
  "Artificial Intelligence and Robotics",
  "Asian-American Studies",
  "Astronomy",
  "Astrophysics",
  "Athletic Training",
  "Atmospheric Science",
  "Automotive Engineering",
  "Aviation",
  "Bakery Science",
  "Biblical Studies",
  "Biochemistry",
  "Bioethics",
  "Biology",
  "Biomedical Engineering",
  "Biomedical Science",
  "Biopsychology",
  "Biotechnology",
  "Botany/Plant Biology",
  "Business Administration",
  "Business Communications",
  "Business Education",
  "Canadian Studies",
  "Caribbean Studies",
  "Cell Biology",
  "Ceramic Engineering",
  "Ceramics",
  "Chemical Engineering",
  "Chemical Physics",
  "Chemistry",
  "Child Care",
  "Child Development",
  "Chinese",
  "Chiropractic",
  "Church Music",
  "Cinematography and Film/Video Production",
  "Circulation Technology",
  "Civil Engineering",
  "Classics",
  "Clinical Psychology",
  "Cognitive Psychology",
  "Communication Disorders",
  "Communications",
  "Communications Studies/Speech Communication and Rhetoric",
  "Comparative Literature",
  "Computer and Information Science",
  "Computer Engineering",
  "Computer Graphics",
  "Computer Science",
  "Computer Systems Analysis",
  "Construction Management",
  "Counseling",
  "Crafts",
  "Creative Writing",
  "Criminal Justice",
  "Criminal Science",
  "Criminology",
  "Culinary Arts",
  "Dance",
  "Data Processing",
  "Dental Hygiene",
  "Developmental Psychology",
  "Diagnostic Medical Sonography",
  "Dietetics",
  "Digital Communications and Media/Multimedia",
  "Drawing",
  "Early Childhood Education",
  "East Asian Studies",
  "East European Studies",
  "Ecology",
  "Economics",
  "Education",
  "Education Administration",
  "Education of the Deaf",
  "Educational Psychology",
  "Electrical Engineering",
  "Elementary Education",
  "Engineering Mechanics",
  "Engineering Physics",
  "English",
  "English Composition",
  "English Literature",
  "Entomology",
  "Entrepreneurship",
  "Environmental Design/Architecture",
  "Environmental Engineering",
  "Environmental Science",
  "Environmental/Environmental Health Engineering",
  "Epidemiology",
  "Equine Studies",
  "Ethnic Studies",
  "European History",
  "Experimental Pathology",
  "Experimental Psychology",
  "Fashion Design",
  "Fashion Merchandising",
  "Feed Science",
  "Fiber, Textiles, and Weaving Arts",
  "Film",
  "Finance",
  "Floriculture",
  "Food Science",
  "Forensic Science",
  "Forestry",
  "French",
  "Furniture Design",
  "Game Design",
  "Gay and Lesbian Studies",
  "Genetics",
  "Geography",
  "Geological Engineering",
  "Geology",
  "Geophysics",
  "German",
  "Gerontology",
  "Government",
  "Graphic Design",
  "Health Administration",
  "Health Sciences",
  "Hebrew",
  "Hispanic-American, Puerto Rican, and Chicano Studies",
  "Historic Preservation",
  "History",
  "Home Economics",
  "Horticulture",
  "Hospitality",
  "Hospitality Management",
  "Human Development",
  "Human Resources Management",
  "Illustration",
  "Industrial Design",
  "Industrial Engineering",
  "Industrial Management",
  "Industrial Psychology",
  "Information Systems",
  "Information Technology",
  "Interior Architecture",
  "Interior Design",
  "International Agriculture",
  "International Business",
  "International Relations",
  "International Studies",
  "Islamic Studies",
  "Italian",
  "Japanese",
  "Jazz Studies",
  "Jewelry and Metalsmithing",
  "Jewish Studies",
  "Journalism",
  "Kinesiology",
  "Korean",
  "Land Use Planning and Management",
  "Landscape Architecture",
  "Landscape Horticulture",
  "Latin American Studies",
  "Library Science",
  "Linguistics",
  "Logistics Management",
  "Management Information Systems",
  "Managerial Economics",
  "Marine Biology",
  "Marine Science",
  "Marketing",
  "Mass Communication",
  "Massage Therapy",
  "Materials Science",
  "Mathematics",
  "Mechanical Engineering",
  "Medical Technology",
  "Medieval and Renaissance Studies",
  "Mental Health Services",
  "Merchandising and Buying Operations",
  "Metallurgical Engineering",
  "Microbiology",
  "Middle Eastern Studies",
  "Military Science",
  "Mineral Engineering",
  "Missions",
  "Modern Greek",
  "Molecular Biology",
  "Molecular Genetics",
  "Mortuary Science",
  "Museum Studies",
  "Music",
  "Music Education",
  "Music History",
  "Music Management",
  "Nursing",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Relations",
  "Sociology",
  "Sports Management",
  "Supply Chain Management"
];

export const minors = [
  "Accounting",
  "Actuarial Science",
  "Advertising",
  "African Studies",
  "African-American Studies",
  "American History",
  "American Literature",
  "American Studies",
  "Anthropology",
  "Arabic",
  "Art",
  "Art History",
  "Astronomy",
  "Biology",
  "Business",
  "Chemistry",
  "Chinese",
  "Classics",
  "Communications",
  "Computer Science",
  "Creative Writing",
  "Criminal Justice",
  "Dance",
  "Economics",
  "English",
  "Entrepreneurship",
  "Environmental Science",
  "Film",
  "Finance",
  "Foreign Language",
  "French",
  "Geography",
  "Geology",
  "German",
  "Graphic Design",
  "History",
  "Italian",
  "Japanese",
  "Journalism",
  "Korean",
  "Linguistics",
  "Mathematics",
  "Music",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Relations",
  "Sociology",
  "Spanish",
  "Statistics",
  "Theatre"
];

export type IndustrySelectOption = { value: string; label: string };

/** Curated industry list plus an empty row (value `""`) for clear / placeholder flows. */
export function buildIndustrySelectOptions(emptyLabel: string): IndustrySelectOption[] {
  return [{ value: '', label: emptyLabel }, ...industries.map((i) => ({ value: i, label: i }))];
}

/** Alumni directory filter: value "" means no industry filter. */
export const alumniDirectoryIndustryFilterOptions: IndustrySelectOption[] = [
  { value: '', label: 'All Industries' },
  ...industries.map((i) => ({ value: i, label: i })),
];