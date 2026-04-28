# Trailblaize Master Reference Dataset
**Purpose:** Hardcoded seed data for Space matching. Any user who signs up should match ≥1 org. 
**Owner:** Devin (DB import) 
**Last updated:** 2026-04-22

---

## SECTION 1: SCHOOLS

### 1A. Universities & Colleges

> **Note on full D1 import:** There are ~360 D1 schools total. Full list available at ncaa.org/schools. Below covers Power 4 + Group of 5 conferences + key independents + top private/LAC schools. Remaining mid-majors and D2/D3 can be bulk-imported from College Scorecard API: `https://api.data.gov/ed/collegescorecard/v1/schools`

#### Power 4 — SEC (16 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| University of Alabama | Tuscaloosa | AL | SEC | D1-FBS | Public |
| University of Arkansas | Fayetteville | AR | SEC | D1-FBS | Public |
| Auburn University | Auburn | AL | SEC | D1-FBS | Public |
| University of Florida | Gainesville | FL | SEC | D1-FBS | Public |
| University of Georgia | Athens | GA | SEC | D1-FBS | Public |
| University of Kentucky | Lexington | KY | SEC | D1-FBS | Public |
| Louisiana State University | Baton Rouge | LA | SEC | D1-FBS | Public |
| Mississippi State University | Starkville | MS | SEC | D1-FBS | Public |
| University of Missouri | Columbia | MO | SEC | D1-FBS | Public |
| University of Mississippi (Ole Miss) | Oxford | MS | SEC | D1-FBS | Public |
| University of Oklahoma | Norman | OK | SEC | D1-FBS | Public |
| University of South Carolina | Columbia | SC | SEC | D1-FBS | Public |
| University of Tennessee | Knoxville | TN | SEC | D1-FBS | Public |
| University of Texas at Austin | Austin | TX | SEC | D1-FBS | Public |
| Texas A&M University | College Station | TX | SEC | D1-FBS | Public |
| Vanderbilt University | Nashville | TN | SEC | D1-FBS | Private |

#### Power 4 — Big Ten (18 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| University of Illinois Urbana-Champaign | Champaign | IL | Big Ten | D1-FBS | Public |
| Indiana University | Bloomington | IN | Big Ten | D1-FBS | Public |
| University of Iowa | Iowa City | IA | Big Ten | D1-FBS | Public |
| University of Maryland | College Park | MD | Big Ten | D1-FBS | Public |
| University of Michigan | Ann Arbor | MI | Big Ten | D1-FBS | Public |
| Michigan State University | East Lansing | MI | Big Ten | D1-FBS | Public |
| University of Minnesota | Minneapolis | MN | Big Ten | D1-FBS | Public |
| University of Nebraska-Lincoln | Lincoln | NE | Big Ten | D1-FBS | Public |
| Northwestern University | Evanston | IL | Big Ten | D1-FBS | Private |
| Ohio State University | Columbus | OH | Big Ten | D1-FBS | Public |
| Penn State University | University Park | PA | Big Ten | D1-FBS | Public |
| Purdue University | West Lafayette | IN | Big Ten | D1-FBS | Public |
| Rutgers University | New Brunswick | NJ | Big Ten | D1-FBS | Public |
| University of Wisconsin | Madison | WI | Big Ten | D1-FBS | Public |
| UCLA | Los Angeles | CA | Big Ten | D1-FBS | Public |
| USC (University of Southern California) | Los Angeles | CA | Big Ten | D1-FBS | Private |
| University of Oregon | Eugene | OR | Big Ten | D1-FBS | Public |
| University of Washington | Seattle | WA | Big Ten | D1-FBS | Public |

#### Power 4 — Big 12 (16 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| University of Arizona | Tucson | AZ | Big 12 | D1-FBS | Public |
| Arizona State University | Tempe | AZ | Big 12 | D1-FBS | Public |
| Brigham Young University (BYU) | Provo | UT | Big 12 | D1-FBS | Private |
| Baylor University | Waco | TX | Big 12 | D1-FBS | Private |
| University of Central Florida (UCF) | Orlando | FL | Big 12 | D1-FBS | Public |
| University of Cincinnati | Cincinnati | OH | Big 12 | D1-FBS | Public |
| University of Colorado | Boulder | CO | Big 12 | D1-FBS | Public |
| University of Houston | Houston | TX | Big 12 | D1-FBS | Public |
| Iowa State University | Ames | IA | Big 12 | D1-FBS | Public |
| University of Kansas | Lawrence | KS | Big 12 | D1-FBS | Public |
| Kansas State University | Manhattan | KS | Big 12 | D1-FBS | Public |
| Oklahoma State University | Stillwater | OK | Big 12 | D1-FBS | Public |
| TCU (Texas Christian University) | Fort Worth | TX | Big 12 | D1-FBS | Private |
| Texas Tech University | Lubbock | TX | Big 12 | D1-FBS | Public |
| University of Utah | Salt Lake City | UT | Big 12 | D1-FBS | Public |
| West Virginia University | Morgantown | WV | Big 12 | D1-FBS | Public |

#### Power 4 — ACC (17 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Boston College | Chestnut Hill | MA | ACC | D1-FBS | Private |
| Clemson University | Clemson | SC | ACC | D1-FBS | Public |
| Duke University | Durham | NC | ACC | D1-FBS | Private |
| Florida State University | Tallahassee | FL | ACC | D1-FBS | Public |
| Georgia Tech | Atlanta | GA | ACC | D1-FBS | Public |
| University of Louisville | Louisville | KY | ACC | D1-FBS | Public |
| University of Miami | Coral Gables | FL | ACC | D1-FBS | Private |
| NC State University | Raleigh | NC | ACC | D1-FBS | Public |
| University of North Carolina | Chapel Hill | NC | ACC | D1-FBS | Public |
| Notre Dame | Notre Dame | IN | ACC | D1-FBS (Ind. Football) | Private |
| University of Pittsburgh | Pittsburgh | PA | ACC | D1-FBS | Public |
| Syracuse University | Syracuse | NY | ACC | D1-FBS | Private |
| University of Virginia | Charlottesville | VA | ACC | D1-FBS | Public |
| Virginia Tech | Blacksburg | VA | ACC | D1-FBS | Public |
| Wake Forest University | Winston-Salem | NC | ACC | D1-FBS | Private |
| University of California, Berkeley | Berkeley | CA | ACC | D1-FBS | Public |
| Stanford University | Stanford | CA | ACC | D1-FBS | Private |
| SMU (Southern Methodist University) | Dallas | TX | ACC | D1-FBS | Private |

#### Group of 5 — American Athletic Conference (AAC, 15 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Army (United States Military Academy) | West Point | NY | AAC | D1-FBS | Public |
| University of Charlotte | Charlotte | NC | AAC | D1-FBS | Public |
| East Carolina University | Greenville | NC | AAC | D1-FBS | Public |
| Florida Atlantic University (FAU) | Boca Raton | FL | AAC | D1-FBS | Public |
| University of Memphis | Memphis | TN | AAC | D1-FBS | Public |
| Navy (United States Naval Academy) | Annapolis | MD | AAC | D1-FBS | Public |
| University of North Texas | Denton | TX | AAC | D1-FBS | Public |
| Rice University | Houston | TX | AAC | D1-FBS | Private |
| University of South Florida | Tampa | FL | AAC | D1-FBS | Public |
| Temple University | Philadelphia | PA | AAC | D1-FBS | Public |
| Tulane University | New Orleans | LA | AAC | D1-FBS | Private |
| University of Tulsa | Tulsa | OK | AAC | D1-FBS | Private |
| UAB (University of Alabama at Birmingham) | Birmingham | AL | AAC | D1-FBS | Public |
| UTSA (University of Texas at San Antonio) | San Antonio | TX | AAC | D1-FBS | Public |
| Wichita State University | Wichita | KS | AAC | D1 (basketball) | Public |

#### Group of 5 — Conference USA (CUSA, 10 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Florida International University (FIU) | Miami | FL | CUSA | D1-FBS | Public |
| Jacksonville State University | Jacksonville | AL | CUSA | D1-FBS | Public |
| Kennesaw State University | Kennesaw | GA | CUSA | D1-FBS | Public |
| Liberty University | Lynchburg | VA | CUSA | D1-FBS | Private |
| Louisiana Tech University | Ruston | LA | CUSA | D1-FBS | Public |
| Middle Tennessee State University | Murfreesboro | TN | CUSA | D1-FBS | Public |
| New Mexico State University | Las Cruces | NM | CUSA | D1-FBS | Public |
| Sam Houston State University | Huntsville | TX | CUSA | D1-FBS | Public |
| UTEP (University of Texas at El Paso) | El Paso | TX | CUSA | D1-FBS | Public |
| Western Kentucky University | Bowling Green | KY | CUSA | D1-FBS | Public |

#### Group of 5 — MAC (Mid-American Conference, 12 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| University of Akron | Akron | OH | MAC | D1-FBS | Public |
| Ball State University | Muncie | IN | MAC | D1-FBS | Public |
| Bowling Green State University | Bowling Green | OH | MAC | D1-FBS | Public |
| University at Buffalo | Buffalo | NY | MAC | D1-FBS | Public |
| Central Michigan University | Mount Pleasant | MI | MAC | D1-FBS | Public |
| Eastern Michigan University | Ypsilanti | MI | MAC | D1-FBS | Public |
| Kent State University | Kent | OH | MAC | D1-FBS | Public |
| Miami University (Ohio) | Oxford | OH | MAC | D1-FBS | Public |
| Northern Illinois University (NIU) | DeKalb | IL | MAC | D1-FBS | Public |
| Ohio University | Athens | OH | MAC | D1-FBS | Public |
| University of Toledo | Toledo | OH | MAC | D1-FBS | Public |
| Western Michigan University | Kalamazoo | MI | MAC | D1-FBS | Public |

#### Group of 5 — Mountain West Conference (12 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Air Force Academy | Colorado Springs | CO | Mountain West | D1-FBS | Public |
| Boise State University | Boise | ID | Mountain West | D1-FBS | Public |
| Colorado State University | Fort Collins | CO | Mountain West | D1-FBS | Public |
| Fresno State University | Fresno | CA | Mountain West | D1-FBS | Public |
| University of Hawaii | Honolulu | HI | Mountain West | D1-FBS | Public |
| University of Nevada, Reno | Reno | NV | Mountain West | D1-FBS | Public |
| University of New Mexico | Albuquerque | NM | Mountain West | D1-FBS | Public |
| San Diego State University (SDSU) | San Diego | CA | Mountain West | D1-FBS | Public |
| San Jose State University | San Jose | CA | Mountain West | D1-FBS | Public |
| UNLV (University of Nevada, Las Vegas) | Las Vegas | NV | Mountain West | D1-FBS | Public |
| Utah State University | Logan | UT | Mountain West | D1-FBS | Public |
| University of Wyoming | Laramie | WY | Mountain West | D1-FBS | Public |

#### Group of 5 — Sun Belt Conference (14 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Appalachian State University | Boone | NC | Sun Belt | D1-FBS | Public |
| Arkansas State University | Jonesboro | AR | Sun Belt | D1-FBS | Public |
| Coastal Carolina University | Conway | SC | Sun Belt | D1-FBS | Public |
| Georgia Southern University | Statesboro | GA | Sun Belt | D1-FBS | Public |
| Georgia State University | Atlanta | GA | Sun Belt | D1-FBS | Public |
| James Madison University | Harrisonburg | VA | Sun Belt | D1-FBS | Public |
| University of Louisiana at Lafayette | Lafayette | LA | Sun Belt | D1-FBS | Public |
| University of Louisiana Monroe | Monroe | LA | Sun Belt | D1-FBS | Public |
| Marshall University | Huntington | WV | Sun Belt | D1-FBS | Public |
| Old Dominion University | Norfolk | VA | Sun Belt | D1-FBS | Public |
| University of South Alabama | Mobile | AL | Sun Belt | D1-FBS | Public |
| University of Southern Mississippi | Hattiesburg | MS | Sun Belt | D1-FBS | Public |
| Texas State University | San Marcos | TX | Sun Belt | D1-FBS | Public |
| Troy University | Troy | AL | Sun Belt | D1-FBS | Public |

#### Pac-12 Remnants (2 schools)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Oregon State University | Corvallis | OR | Pac-12 | D1-FBS | Public |
| Washington State University | Pullman | WA | Pac-12 | D1-FBS | Public |

#### FBS Independents
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Connecticut (UConn) | Storrs | CT | Independent | D1-FBS | Public |
| Massachusetts (UMass) | Amherst | MA | Independent | D1-FBS | Public |

#### Ivy League (8 schools — D1 non-scholarship)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Brown University | Providence | RI | Ivy League | D1-FCS | Private |
| Columbia University | New York | NY | Ivy League | D1-FCS | Private |
| Cornell University | Ithaca | NY | Ivy League | D1-FCS | Private |
| Dartmouth College | Hanover | NH | Ivy League | D1-FCS | Private |
| Harvard University | Cambridge | MA | Ivy League | D1-FCS | Private |
| University of Pennsylvania | Philadelphia | PA | Ivy League | D1-FCS | Private |
| Princeton University | Princeton | NJ | Ivy League | D1-FCS | Private |
| Yale University | New Haven | CT | Ivy League | D1-FCS | Private |

#### Top 50 Private Universities (non-Power 4, non-Ivy)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Massachusetts Institute of Technology (MIT) | Cambridge | MA | NEWMAC | D3 | Private |
| California Institute of Technology (Caltech) | Pasadena | CA | SCIAC | D3 | Private |
| Johns Hopkins University | Baltimore | MD | Centennial | D3 | Private |
| University of Chicago | Chicago | IL | UAA | D3 | Private |
| Carnegie Mellon University | Pittsburgh | PA | UAA | D3 | Private |
| Rice University | Houston | TX | AAC | D1-FBS | Private |
| Emory University | Atlanta | GA | UAA | D3 | Private |
| Washington University in St. Louis | St. Louis | MO | UAA | D3 | Private |
| Tufts University | Medford | MA | NESCAC | D3 | Private |
| Case Western Reserve University | Cleveland | OH | UAA | D3 | Private |
| Tulane University | New Orleans | LA | AAC | D1-FBS | Private |
| Brandeis University | Waltham | MA | UAA | D3 | Private |
| Villanova University | Villanova | PA | Big East | D1-FCS | Private |
| Georgetown University | Washington | DC | Big East | D1 (no football) | Private |
| Marquette University | Milwaukee | WI | Big East | D1 (no football) | Private |
| Fordham University | Bronx | NY | Patriot League | D1-FCS | Private |
| Lehigh University | Bethlehem | PA | Patriot League | D1-FCS | Private |
| Holy Cross | Worcester | MA | Patriot League | D1-FCS | Private |
| Colgate University | Hamilton | NY | Patriot League | D1-FCS | Private |
| Bucknell University | Lewisburg | PA | Patriot League | D1-FCS | Private |
| American University | Washington | DC | Patriot League | D1 (no football) | Private |
| University of Denver | Denver | CO | Summit League | D1 | Private |
| Gonzaga University | Spokane | WA | WCC | D1 | Private |
| Santa Clara University | Santa Clara | CA | WCC | D1 | Private |
| St. Mary's College of California | Moraga | CA | WCC | D1 | Private |
| University of San Diego | San Diego | CA | WCC | D1 | Private |
| University of San Francisco | San Francisco | CA | WCC | D1 | Private |
| Pepperdine University | Malibu | CA | WCC | D1 | Private |
| Loyola Marymount University (LMU) | Los Angeles | CA | WCC | D1 | Private |
| Brigham Young University (BYU) | Provo | UT | Big 12 | D1-FBS | Private |
| Creighton University | Omaha | NE | Big East | D1 | Private |
| Butler University | Indianapolis | IN | Big East | D1 | Private |
| Xavier University | Cincinnati | OH | Big East | D1 | Private |
| Providence College | Providence | RI | Big East | D1 | Private |
| St. John's University | Jamaica | NY | Big East | D1 | Private |
| Seton Hall University | South Orange | NJ | Big East | D1 | Private |
| DePaul University | Chicago | IL | Big East | D1 | Private |
| Baylor University | Waco | TX | Big 12 | D1-FBS | Private |
| TCU | Fort Worth | TX | Big 12 | D1-FBS | Private |
| Wake Forest University | Winston-Salem | NC | ACC | D1-FBS | Private |
| SMU | Dallas | TX | ACC | D1-FBS | Private |
| Duke University | Durham | NC | ACC | D1-FBS | Private |
| Vanderbilt University | Nashville | TN | SEC | D1-FBS | Private |
| Northwestern University | Evanston | IL | Big Ten | D1-FBS | Private |
| USC | Los Angeles | CA | Big Ten | D1-FBS | Private |
| Notre Dame | Notre Dame | IN | ACC | D1-FBS | Private |
| Stanford University | Stanford | CA | ACC | D1-FBS | Private |
| Boston College | Chestnut Hill | MA | ACC | D1-FBS | Private |
| Miami University | Coral Gables | FL | ACC | D1-FBS | Private |

#### Top 50 Liberal Arts Colleges
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| Williams College | Williamstown | MA | NESCAC | D3 | Private |
| Amherst College | Amherst | MA | NESCAC | D3 | Private |
| Swarthmore College | Swarthmore | PA | Centennial | D3 | Private |
| Pomona College | Claremont | CA | SCIAC | D3 | Private |
| Wellesley College | Wellesley | MA | NEWMAC | D3 | Private |
| Bowdoin College | Brunswick | ME | NESCAC | D3 | Private |
| Carleton College | Northfield | MN | MIAC | D3 | Private |
| Middlebury College | Middlebury | VT | NESCAC | D3 | Private |
| Davidson College | Davidson | NC | Atlantic 10 | D1 | Private |
| Grinnell College | Grinnell | IA | Midwest | D3 | Private |
| Claremont McKenna College | Claremont | CA | SCIAC | D3 | Private |
| Smith College | Northampton | MA | NEWMAC | D3 | Private |
| Haverford College | Haverford | PA | Centennial | D3 | Private |
| Vassar College | Poughkeepsie | NY | Liberty League | D3 | Private |
| Colby College | Waterville | ME | NESCAC | D3 | Private |
| Wesleyan University | Middletown | CT | NESCAC | D3 | Private |
| Hamilton College | Clinton | NY | NESCAC | D3 | Private |
| Oberlin College | Oberlin | OH | NCAC | D3 | Private |
| Bryn Mawr College | Bryn Mawr | PA | Centennial | D3 | Private |
| Trinity College | Hartford | CT | NESCAC | D3 | Private |
| Macalester College | St. Paul | MN | MIAC | D3 | Private |
| Bates College | Lewiston | ME | NESCAC | D3 | Private |
| Washington and Lee University | Lexington | VA | Old Dominion | D3 | Private |
| Kenyon College | Gambier | OH | NCAC | D3 | Private |
| Barnard College | New York | NY | UAA | D3 | Private |
| Franklin & Marshall College | Lancaster | PA | Centennial | D3 | Private |
| Colgate University | Hamilton | NY | Patriot League | D1-FCS | Private |
| Holy Cross | Worcester | MA | Patriot League | D1-FCS | Private |
| Bucknell University | Lewisburg | PA | Patriot League | D1-FCS | Private |
| Lafayette College | Easton | PA | Patriot League | D1-FCS | Private |
| Skidmore College | Saratoga Springs | NY | Liberty League | D3 | Private |
| Colorado College | Colorado Springs | CO | SCAC | D3 | Private |
| Furman University | Greenville | SC | SoCon | D1-FCS | Private |
| Rhodes College | Memphis | TN | SCAC | D3 | Private |
| Reed College | Portland | OR | None | D3 | Private |
| Whitman College | Walla Walla | WA | NWC | D3 | Private |
| St. Olaf College | Northfield | MN | MIAC | D3 | Private |
| Gettysburg College | Gettysburg | PA | Centennial | D3 | Private |
| Muhlenberg College | Allentown | PA | Centennial | D3 | Private |
| Denison University | Granville | OH | NCAC | D3 | Private |
| DePauw University | Greencastle | IN | NCAC | D3 | Private |
| Wabash College | Crawfordsville | IN | NCAC | D3 | Private |
| St. Lawrence University | Canton | NY | Liberty League | D3 | Private |
| Union College | Schenectady | NY | Liberty League | D3 | Private |
| Hobart and William Smith Colleges | Geneva | NY | Liberty League | D3 | Private |
| Ithaca College | Ithaca | NY | Liberty League | D3 | Private |
| Allegheny College | Meadville | PA | NCAC | D3 | Private |
| Kalamazoo College | Kalamazoo | MI | MIAA | D3 | Private |
| Dickinson College | Carlisle | PA | Centennial | D3 | Private |
| Agnes Scott College | Decatur | GA | USA South | D3 | Private |

#### Notable D1 Schools (Mid-Major / Other Conferences)
| School Name | City | State | Conference | Division | Type |
|---|---|---|---|---|---|
| University of Connecticut (UConn) | Storrs | CT | Big East | D1-FBS | Public |
| University of Cincinnati | Cincinnati | OH | Big 12 | D1-FBS | Public |
| Temple University | Philadelphia | PA | AAC | D1-FBS | Public |
| Wichita State University | Wichita | KS | AAC | D1 | Public |
| Murray State University | Murray | KY | OVC | D1-FCS | Public |
| Belmont University | Nashville | TN | MVC | D1 | Private |
| Drake University | Des Moines | IA | MVC | D1-FCS | Private |
| Valparaiso University | Valparaiso | IN | MVC | D1 | Private |
| Northern Iowa | Cedar Falls | IA | MVC | D1-FCS | Public |
| Southern Illinois University | Carbondale | IL | MVC | D1-FCS | Public |
| Indiana State University | Terre Haute | IN | MVC | D1-FCS | Public |
| Illinois State University | Normal | IL | MVC | D1-FCS | Public |
| Bradley University | Peoria | IL | MVC | D1 | Private |
| Missouri State University | Springfield | MO | MVC | D1-FCS | Public |
| Loyola University Chicago | Chicago | IL | MVC | D1 | Private |
| Evansville | Evansville | IN | MVC | D1 | Private |
| Liberty University | Lynchburg | VA | CUSA | D1-FBS | Private |
| UC Davis | Davis | CA | Big West | D1-FCS | Public |
| Cal Poly | San Luis Obispo | CA | Big West | D1-FCS | Public |
| UC Santa Barbara | Santa Barbara | CA | Big West | D1 | Public |
| Long Beach State | Long Beach | CA | Big West | D1 | Public |
| UC Irvine | Irvine | CA | Big West | D1 | Public |
| UC Riverside | Riverside | CA | Big West | D1 | Public |
| Cal State Fullerton | Fullerton | CA | Big West | D1 | Public |
| UC San Diego | San Diego | CA | Big West | D1 | Public |
| Weber State | Ogden | UT | Big Sky | D1-FCS | Public |
| Montana | Missoula | MT | Big Sky | D1-FCS | Public |
| North Dakota State (NDSU) | Fargo | ND | MVFC | D1-FCS | Public |
| South Dakota State | Brookings | SD | MVFC | D1-FCS | Public |
| James Madison | Harrisonburg | VA | Sun Belt | D1-FBS | Public |
| Jacksonville State | Jacksonville | AL | CUSA | D1-FBS | Public |
| Kennesaw State | Kennesaw | GA | CUSA | D1-FBS | Public |
| Stony Brook | Stony Brook | NY | CAA | D1-FCS | Public |
| Villanova | Villanova | PA | CAA | D1-FCS | Private |
| William & Mary | Williamsburg | VA | CAA | D1-FCS | Public |
| Towson University | Towson | MD | CAA | D1-FCS | Public |
| Delaware | Newark | DE | CAA | D1-FCS | Public |
| Albany (SUNY) | Albany | NY | CAA | D1-FCS | Public |
| New Hampshire | Durham | NH | CAA | D1-FCS | Public |
| Maine | Orono | ME | CAA | D1-FCS | Public |
| Rhode Island | Kingston | RI | CAA | D1-FCS | Public |
| Northeastern University | Boston | MA | CAA | D1 | Private |
| George Mason University | Fairfax | VA | Atlantic 10 | D1 | Public |
| George Washington University | Washington | DC | Atlantic 10 | D1 | Private |
| Saint Louis University | St. Louis | MO | Atlantic 10 | D1 | Private |
| University of Dayton | Dayton | OH | Atlantic 10 | D1 | Private |
| VCU (Virginia Commonwealth) | Richmond | VA | Atlantic 10 | D1 | Public |
| La Salle University | Philadelphia | PA | Atlantic 10 | D1 | Private |
| St. Joseph's University | Philadelphia | PA | Atlantic 10 | D1 | Private |
| Fordham University | Bronx | NY | Atlantic 10 | D1-FCS | Private |
| Davidson College | Davidson | NC | Atlantic 10 | D1 | Private |
| Duquesne University | Pittsburgh | PA | Atlantic 10 | D1-FCS | Private |
| University of Massachusetts | Amherst | MA | Atlantic 10 | D1 | Public |
| University of Richmond | Richmond | VA | Atlantic 10 | D1-FCS | Private |
| Saint Bonaventure | St. Bonaventure | NY | Atlantic 10 | D1 | Private |
| Siena College | Loudonville | NY | MAAC | D1 | Private |
| Iona University | New Rochelle | NY | MAAC | D1 | Private |
| Manhattan College | Riverdale | NY | MAAC | D1 | Private |
| Rider University | Lawrenceville | NJ | MAAC | D1 | Private |
| Fairfield University | Fairfield | CT | MAAC | D1 | Private |
| Monmouth University | West Long Branch | NJ | Big South | D1-FCS | Private |
| Campbell University | Buies Creek | NC | Big South | D1-FCS | Private |
| Gardner-Webb University | Boiling Springs | NC | Big South | D1-FCS | Private |
| ETSU (East Tennessee State) | Johnson City | TN | SoCon | D1-FCS | Public |
| Wofford College | Spartanburg | SC | SoCon | D1-FCS | Private |
| Samford University | Birmingham | AL | SoCon | D1-FCS | Private |
| The Citadel | Charleston | SC | SoCon | D1-FCS | Public |
| Furman University | Greenville | SC | SoCon | D1-FCS | Private |
| Mercer University | Macon | GA | SoCon | D1-FCS | Private |
| Western Carolina | Cullowhee | NC | SoCon | D1-FCS | Public |
| Chattanooga | Chattanooga | TN | SoCon | D1-FCS | Public |
| Bellarmine University | Louisville | KY | ASUN | D1 | Private |
| Lipscomb University | Nashville | TN | ASUN | D1 | Private |
| Jacksonville University | Jacksonville | FL | ASUN | D1 | Private |
| Florida Gulf Coast University | Fort Myers | FL | ASUN | D1 | Public |
| Eastern Kentucky University | Richmond | KY | ASUN | D1-FCS | Public |
| Northern Kentucky University | Highland Heights | KY | Horizon | D1 | Public |
| Wright State University | Dayton | OH | Horizon | D1 | Public |
| Milwaukee (UWM) | Milwaukee | WI | Horizon | D1 | Public |
| Oakland University | Rochester Hills | MI | Horizon | D1 | Public |
| IUPUI / Indiana Univ. Indianapolis | Indianapolis | IN | Horizon | D1 | Public |
| Green Bay (UW-Green Bay) | Green Bay | WI | Horizon | D1 | Public |
| Youngstown State | Youngstown | OH | MVFC | D1-FCS | Public |
| South Dakota | Vermillion | SD | MVFC | D1-FCS | Public |
| North Dakota | Grand Forks | ND | MVFC | D1-FCS | Public |
| Western Illinois | Macomb | IL | MVFC | D1-FCS | Public |
| Incarnate Word | San Antonio | TX | Southland | D1-FCS | Private |
| Nicholls State | Thibodaux | LA | Southland | D1-FCS | Public |
| Lamar University | Beaumont | TX | Southland | D1-FCS | Public |
| Stephen F. Austin | Nacogdoches | TX | Southland | D1-FCS | Public |
| Central Arkansas | Conway | AR | Southland | D1-FCS | Public |
| Grambling State | Grambling | LA | SWAC | D1-FCS | Public |
| Jackson State University | Jackson | MS | SWAC | D1-FCS | Public |
| Alcorn State University | Lorman | MS | SWAC | D1-FCS | Public |
| Prairie View A&M | Prairie View | TX | SWAC | D1-FCS | Public |
| Southern University | Baton Rouge | LA | SWAC | D1-FCS | Public |
| Alabama A&M | Normal | AL | SWAC | D1-FCS | Public |
| Alabama State University | Montgomery | AL | SWAC | D1-FCS | Public |
| Bethune-Cookman | Daytona Beach | FL | SWAC | D1-FCS | Private |
| Florida A&M (FAMU) | Tallahassee | FL | SWAC | D1-FCS | Public |
| Mississippi Valley State | Itta Bena | MS | SWAC | D1-FCS | Public |
| Texas Southern University | Houston | TX | SWAC | D1-FCS | Public |
| Howard University | Washington | DC | MEAC | D1-FCS | Private |
| Morgan State University | Baltimore | MD | MEAC | D1-FCS | Public |
| North Carolina A&T | Greensboro | NC | Big South | D1-FCS | Public |
| North Carolina Central | Durham | NC | MEAC | D1-FCS | Public |
| Coppin State | Baltimore | MD | MEAC | D1 | Public |
| Hampton University | Hampton | VA | CAA | D1-FCS | Private |
| Norfolk State University | Norfolk | VA | MEAC | D1-FCS | Public |
| South Carolina State | Orangeburg | SC | MEAC | D1-FCS | Public |
| Savannah State | Savannah | GA | SIAC | D2 | Public |
| Seton Hall University | South Orange | NJ | Big East | D1 | Private |
| St. John's University | Jamaica | NY | Big East | D1 | Private |
| Providence College | Providence | RI | Big East | D1 | Private |
| Xavier University | Cincinnati | OH | Big East | D1 | Private |
| Butler University | Indianapolis | IN | Big East | D1 | Private |
| Creighton University | Omaha | NE | Big East | D1 | Private |
| DePaul University | Chicago | IL | Big East | D1 | Private |
| Marquette University | Milwaukee | WI | Big East | D1 | Private |
| Georgetown University | Washington | DC | Big East | D1 | Private |
| Boise State | Boise | ID | Mountain West | D1-FBS | Public |
| Nevada Las Vegas (UNLV) | Las Vegas | NV | Mountain West | D1-FBS | Public |

> **Note:** Full D1 school list (~360 total) should be bulk-imported from NCAA sports reference or College Scorecard. This list covers ~250+ major institutions.

---

### 1B. High Schools

**Import Strategy:** High schools are too numerous (27,000+) to hardcode individually.

**Data Sources:**
- **Public Schools:** [NCES Common Core of Data (CCD)](https://nces.ed.gov/ccd/) — updated annually, downloadable CSV
  - Filter: `school_type = "Regular school"` + `grade_span includes 12th grade`
  - ~16,000 public high schools
- **Private Schools:** [NCES Private School Survey (PSS)](https://nces.ed.gov/surveys/pss/) — biennial survey
  - ~10,000+ private high schools
- **API:** NCES Education Data API: `https://educationdata.urban.org/api/v1/schools/ccd/`

**Recommended approach for Devin:** Bulk import from NCES CCD with fields: School Name, City, State, NCES ID, Grade Span, School Type (Public/Private/Charter). Filter to schools serving grade 12. Use NCES ID as unique identifier.

---

## SECTION 2: GREEK LIFE

### 2A. NIC Fraternities (North American Interfraternity Conference)

~62 member organizations as of 2025:

1. Acacia
2. Alpha Chi Rho
3. Alpha Delta Gamma
4. Alpha Delta Phi
5. Alpha Epsilon Pi (AEPi)
6. Alpha Gamma Rho
7. Alpha Gamma Sigma
8. Alpha Kappa Lambda
9. Alpha Phi Delta
10. Alpha Sigma Phi
11. Alpha Tau Omega (ATO)
12. Beta Chi Theta *(Note: also in MGC)*
13. Beta Sigma Psi
14. Beta Theta Pi
15. Chi Phi
16. Chi Psi
17. Delta Chi
18. Delta Kappa Epsilon (DKE)
19. Delta Phi
20. Delta Sigma Phi
21. Delta Tau Delta
22. Delta Upsilon
23. FarmHouse
24. Kappa Alpha Order (KA)
25. Kappa Alpha Society
26. Kappa Delta Phi
27. Kappa Delta Rho
28. Kappa Sigma
29. Lambda Chi Alpha
30. Lambda Phi Epsilon *(Note: also in MGC)*
31. Lambda Theta Phi *(Note: also in MGC)*
32. Omega Delta Phi *(Note: also in MGC)*
33. Phi Delta Theta
34. Phi Gamma Delta (FIJI)
35. Phi Kappa Psi
36. Phi Kappa Sigma
37. Phi Kappa Tau
38. Phi Kappa Theta
39. Phi Mu Delta
40. Phi Sigma Kappa
41. Pi Kappa Alpha (PIKE)
42. Pi Kappa Phi
43. Pi Lambda Phi
44. Psi Upsilon
45. Sigma Alpha Epsilon (SAE)
46. Sigma Alpha Mu (Sammy)
47. Sigma Chi
48. Sigma Nu
49. Sigma Phi Epsilon (SigEp)
50. Sigma Pi
51. Sigma Tau Gamma
52. Tau Delta Phi
53. Tau Epsilon Phi
54. Tau Kappa Epsilon (TKE)
55. Theta Chi
56. Theta Delta Chi
57. Theta Xi
58. Triangle Fraternity
59. Zeta Beta Tau (ZBT)
60. Zeta Psi
61. Alpha Epsilon Pi (listed above, see #5)
62. Phi Sigma Pi *(honor/co-ed, sometimes listed)*

> **Source for complete/current list:** northamericaninterfraternity.org

---

### 2B. NPC Sororities (National Panhellenic Conference)

26 member organizations:

1. Alpha Chi Omega (AXO)
2. Alpha Delta Pi (ADPi)
3. Alpha Epsilon Phi (AEPhi)
4. Alpha Gamma Delta (AGD)
5. Alpha Omicron Pi (AOII)
6. Alpha Phi (APhi)
7. Alpha Sigma Alpha (ASA)
8. Alpha Sigma Tau (AST)
9. Alpha Xi Delta (AXiD)
10. Chi Omega (Chi O)
11. Delta Delta Delta (Tri Delta)
12. Delta Gamma (DG)
13. Delta Phi Epsilon (DPhiE)
14. Delta Zeta (DZ)
15. Gamma Phi Beta
16. Kappa Alpha Theta (Theta)
17. Kappa Delta (KD)
18. Kappa Kappa Gamma (Kappa)
19. Phi Mu
20. Phi Sigma Sigma (PhiSig)
21. Pi Beta Phi (Pi Phi)
22. Sigma Delta Tau (SDT)
23. Sigma Kappa (SK)
24. Sigma Sigma Sigma (Tri Sigma)
25. Theta Phi Alpha
26. Zeta Tau Alpha (ZTA)

> **Source:** npcwomen.org

---

### 2C. NPHC — The Divine Nine

9 organizations of the National Pan-Hellenic Council (HBCUs + PWIs):

**Fraternities:**
1. Alpha Phi Alpha (ΑΦΑ) — founded 1906, Cornell
2. Kappa Alpha Psi (ΚΑΨ) — founded 1911, Indiana
3. Omega Psi Phi (ΩΨΦ) — founded 1911, Howard
4. Phi Beta Sigma (ΦΒΣ) — founded 1914, Howard
5. Iota Phi Theta (ΙΦΘ) — founded 1963, Morgan State

**Sororities:**
6. Alpha Kappa Alpha (ΑΚΑ) — founded 1908, Howard
7. Delta Sigma Theta (ΔΣΘ) — founded 1913, Howard
8. Zeta Phi Beta (ΖΦΒ) — founded 1920, Howard
9. Sigma Gamma Rho (ΣΓΡ) — founded 1922, Butler

> **Source:** nphchq.org

---

### 2D. Multicultural Greek Council (MGC) — Top Organizations

**Fraternities:**
1. Lambda Phi Epsilon (Asian-interest, 1981)
2. Lambda Theta Phi (Latino, 1975)
3. Lambda Upsilon Lambda (Latino "La Unidad Latina")
4. Omega Delta Phi (Latino)
5. Pi Alpha Phi (Asian-interest)
6. Phi Iota Alpha (Latino, oldest Latino fraternity, 1931)
7. Sigma Lambda Beta (Latino/multicultural)
8. Nu Alpha Phi (Asian-interest)
9. Pi Delta Psi (Asian-interest)
10. Beta Chi Theta (South Asian)
11. Sigma Beta Rho (South Asian/multicultural)
12. Alpha Kappa Delta Phi (Asian-interest sorority)
13. Tau Kappa Phi (South Asian)

**Sororities:**
14. Lambda Theta Alpha (Latina)
15. Sigma Lambda Gamma (Latina/multicultural)
16. Sigma Lambda Upsilon / Señoritas Latinas Unidas
17. Delta Phi Lambda (Asian-interest)
18. Gamma Alpha Omega (Latina)
19. Mu Sigma Upsilon (multicultural)
20. Chi Delta Theta (Asian-interest)
21. Theta Nu Xi (multicultural)
22. Omega Phi Beta (Latina)
23. Alpha Pi Omega (Native American)

> **Source:** nacglo.org + individual organization websites

---

### 2E. Professional & Service Fraternities/Sororities

**Business:**
1. Alpha Kappa Psi (AKPsi) — co-ed, business
2. Delta Sigma Pi (DSP) — co-ed, business
3. Phi Chi Theta — co-ed, business/economics
4. Phi Gamma Nu — women's, business

**Law / Pre-Law:**
5. Phi Alpha Delta (PAD) — co-ed, pre-law/law
6. Phi Delta Phi — law
7. Delta Theta Phi — law
8. Kappa Beta Pi — women's law

**Engineering / Technical:**
9. Theta Tau — engineering (professional)
10. Triangle — STEM (engineering, science, architecture)
11. Alpha Chi Sigma — chemistry

**Architecture:**
12. Alpha Rho Chi (APX)

**Music / Band:**
13. Kappa Kappa Psi — band (men's)
14. Tau Beta Sigma — band (women's)
15. Phi Mu Alpha Sinfonia — music (men's)
16. Sigma Alpha Iota — music (women's)

**Service / General:**
17. Alpha Phi Omega (APO) — co-ed, service
18. Phi Sigma Pi — co-ed, honor/service

**Health / Medical:**
19. Phi Delta Epsilon — medical
20. Lambda Kappa Sigma — women's pharmacy

---

## SECTION 3: SPORTS — NCAA

### 3A. NCAA Division I — All Sanctioned Sports

**Men's Sports (D1):**
1. Baseball
2. Basketball
3. Cross Country
4. Fencing
5. Football (FBS & FCS)
6. Golf
7. Gymnastics
8. Ice Hockey
9. Lacrosse
10. Rifle (co-ed)
11. Rowing
12. Skiing
13. Soccer
14. Swimming & Diving
15. Tennis
16. Indoor Track & Field
17. Outdoor Track & Field
18. Volleyball
19. Water Polo
20. Wrestling

**Women's Sports (D1):**
1. Basketball
2. Beach Volleyball
3. Bowling
4. Cross Country
5. Equestrian
6. Fencing
7. Field Hockey
8. Golf
9. Gymnastics
10. Ice Hockey
11. Lacrosse
12. Rifle (co-ed)
13. Rowing
14. Skiing
15. Soccer
16. Softball
17. Swimming & Diving
18. Tennis
19. Indoor Track & Field
20. Outdoor Track & Field
21. Triathlon
22. Volleyball
23. Water Polo
24. Wrestling (emerging sport)

> **Note:** Rifle is co-ed at NCAA level. Emerging sports vary by school.

---

### 3B. Club Sports (Standardized List)

1. Ultimate Frisbee
2. Rugby
3. Lacrosse (Club)
4. Water Polo (Club)
5. Rowing / Crew
6. Cycling
7. Triathlon (Club)
8. Volleyball (Club)
9. Equestrian (Club)
10. Fencing (Club)
11. Archery
12. Martial Arts
13. Boxing
14. Wrestling (Club)
15. Rock Climbing
16. Skiing & Snowboarding
17. Sailing
18. Surfing
19. Weightlifting
20. Powerlifting
21. Dodgeball
22. Badminton
23. Table Tennis
24. Squash
25. Field Hockey (Club)
26. Ice Hockey (Club)
27. Figure Skating
28. Esports
29. Cheerleading
30. Dance
31. Gymnastics (Club)
32. Polo
33. Softball (Club)
34. Flag Football
35. Pickleball

---

## SECTION 4: PROFESSIONAL SPORTS

### 4A. NFL — 32 Teams

**AFC East:**
- Buffalo Bills
- Miami Dolphins
- New England Patriots
- New York Jets

**AFC North:**
- Baltimore Ravens
- Cincinnati Bengals
- Cleveland Browns
- Pittsburgh Steelers

**AFC South:**
- Houston Texans
- Indianapolis Colts
- Jacksonville Jaguars
- Tennessee Titans

**AFC West:**
- Denver Broncos
- Kansas City Chiefs
- Las Vegas Raiders
- Los Angeles Chargers

**NFC East:**
- Dallas Cowboys
- New York Giants
- Philadelphia Eagles
- Washington Commanders

**NFC North:**
- Chicago Bears
- Detroit Lions
- Green Bay Packers
- Minnesota Vikings

**NFC South:**
- Atlanta Falcons
- Carolina Panthers
- New Orleans Saints
- Tampa Bay Buccaneers

**NFC West:**
- Arizona Cardinals
- Los Angeles Rams
- San Francisco 49ers
- Seattle Seahawks

---

### 4B. NBA — 30 Teams

**Atlantic:**
- Boston Celtics
- Brooklyn Nets
- New York Knicks
- Philadelphia 76ers
- Toronto Raptors

**Central:**
- Chicago Bulls
- Cleveland Cavaliers
- Detroit Pistons
- Indiana Pacers
- Milwaukee Bucks

**Southeast:**
- Atlanta Hawks
- Charlotte Hornets
- Miami Heat
- Orlando Magic
- Washington Wizards

**Northwest:**
- Denver Nuggets
- Minnesota Timberwolves
- Oklahoma City Thunder
- Portland Trail Blazers
- Utah Jazz

**Pacific:**
- Golden State Warriors
- Los Angeles Clippers
- Los Angeles Lakers
- Phoenix Suns
- Sacramento Kings

**Southwest:**
- Dallas Mavericks
- Houston Rockets
- Memphis Grizzlies
- New Orleans Pelicans
- San Antonio Spurs

---

### 4C. MLB — 30 Teams

**AL East:**
- Baltimore Orioles
- Boston Red Sox
- New York Yankees
- Tampa Bay Rays
- Toronto Blue Jays

**AL Central:**
- Chicago White Sox
- Cleveland Guardians
- Detroit Tigers
- Kansas City Royals
- Minnesota Twins

**AL West:**
- Houston Astros
- Los Angeles Angels
- Oakland Athletics
- Seattle Mariners
- Texas Rangers

**NL East:**
- Atlanta Braves
- Miami Marlins
- New York Mets
- Philadelphia Phillies
- Washington Nationals

**NL Central:**
- Chicago Cubs
- Cincinnati Reds
- Milwaukee Brewers
- Pittsburgh Pirates
- St. Louis Cardinals

**NL West:**
- Arizona Diamondbacks
- Colorado Rockies
- Los Angeles Dodgers
- San Diego Padres
- San Francisco Giants

---

### 4D. NHL — 32 Teams

**Atlantic:**
- Boston Bruins
- Buffalo Sabres
- Detroit Red Wings
- Florida Panthers
- Montreal Canadiens
- Ottawa Senators
- Tampa Bay Lightning
- Toronto Maple Leafs

**Metropolitan:**
- Carolina Hurricanes
- Columbus Blue Jackets
- New Jersey Devils
- New York Islanders
- New York Rangers
- Philadelphia Flyers
- Pittsburgh Penguins
- Washington Capitals

**Central:**
- Chicago Blackhawks
- Colorado Avalanche
- Dallas Stars
- Minnesota Wild
- Nashville Predators
- St. Louis Blues
- Winnipeg Jets
- Utah Hockey Club *(formerly Arizona Coyotes, relocated 2024)*

**Pacific:**
- Anaheim Ducks
- Calgary Flames
- Edmonton Oilers
- Los Angeles Kings
- San Jose Sharks
- Seattle Kraken
- Vancouver Canucks
- Vegas Golden Knights

---

### 4E. MLS — 29 Teams (2024)

**Eastern Conference (15):**
- Atlanta United FC
- CF Montréal
- Charlotte FC
- Chicago Fire FC
- FC Cincinnati
- Columbus Crew
- D.C. United
- Inter Miami CF
- Nashville SC
- New England Revolution
- New York City FC
- New York Red Bulls
- Orlando City SC
- Philadelphia Union
- Toronto FC

**Western Conference (14):**
- Austin FC
- Colorado Rapids
- FC Dallas
- Houston Dynamo FC
- LA Galaxy
- LAFC (Los Angeles FC)
- Minnesota United FC
- Portland Timbers
- Real Salt Lake
- San Jose Earthquakes
- Seattle Sounders FC
- Sporting Kansas City
- St. Louis City SC
- Vancouver Whitecaps FC

> **Note:** San Diego FC joined as 30th team for 2025 season.

---

### 4F. NWSL — 14 Teams (2024)

1. Angel City FC (Los Angeles)
2. Bay FC (San Jose)
3. Chicago Red Stars
4. Houston Dash
5. Kansas City Current
6. NJ/NY Gotham FC
7. North Carolina Courage
8. Orlando Pride
9. Portland Thorns FC
10. Racing Louisville FC
11. San Diego Wave FC
12. Seattle Reign FC
13. Utah Royals FC
14. Washington Spirit

---

### 4G. Minor / Development Leagues

| League | Level | Team Count | Notes |
|---|---|---|---|
| NBA G League | NBA Development | ~30 teams | Direct affiliates of NBA teams |
| Triple-A East / Pacific Coast League | MLB AAA | 30 teams | One affiliate per MLB team |
| Double-A (East + Central + South) | MLB AA | 30 teams | One affiliate per MLB team |
| High-A (East, Central, West) | MLB A+ | 30 teams | One affiliate per MLB team |
| American Hockey League (AHL) | NHL Development | ~32 teams | Direct affiliates of NHL teams |
| ECHL | Hockey AA | ~30 teams | Second-tier pro hockey |
| USL Championship | Soccer Div II | ~25 teams | Second tier below MLS |
| USL League One | Soccer Div III | ~12 teams | Third tier |
| USL Super League | Women's Soccer Div II | ~10 teams | Below NWSL |
| Canadian Football League (CFL) | Pro Football (Canada) | 9 teams | — |
| XFL / USFL | Alternative Pro Football | ~8 teams each | Varies by season |
| Premier Lacrosse League (PLL) | Pro Lacrosse | 8 teams | — |
| National Lacrosse League (NLL) | Box Lacrosse | ~14 teams | — |
| Big3 Basketball | 3-on-3 Pro | 12 teams | — |

> Individual minor league team rosters should be pulled from SportsDB API: `https://www.thesportsdb.com/api.php`

---

## SECTION 5: MILITARY

### 5A. Active Duty Branches (6)

1. United States Army
2. United States Navy
3. United States Air Force
4. United States Marine Corps
5. United States Coast Guard
6. United States Space Force

### 5B. Reserve Components

7. Army Reserve (USAR)
8. Navy Reserve (USNR)
9. Air Force Reserve (USAFR)
10. Marine Corps Reserve (USMCR)
11. Coast Guard Reserve (USCGR)
12. Space Force Reserve *(not yet established as of 2025)*

### 5C. National Guard

13. Army National Guard (ARNG)
14. Air National Guard (ANG)

### 5D. Service Academies

15. United States Military Academy (West Point)
16. United States Naval Academy (Annapolis)
17. United States Air Force Academy
18. United States Coast Guard Academy
19. United States Merchant Marine Academy

### 5E. Sub-Units / Bases / Commands

> Too granular to hardcode. Source from:
> - **Defense.gov:** https://www.defense.gov/
> - **Military Installations:** https://installations.militaryonesource.mil/
> - **Army:** ~100+ installations
> - **Navy:** ~70+ installations
> - **Air Force:** ~100+ installations
>
> Recommended: Allow free-text entry for unit/base name, or provide a dropdown of ~50 major installations (Fort Bragg, Camp Pendleton, Fort Hood, etc.)

### 5F. Major Military Installations (Top 50)
1. Fort Bragg (now Fort Liberty), NC — Army
2. Fort Hood (now Fort Cavazos), TX — Army
3. Fort Campbell, KY/TN — Army
4. Fort Benning (now Fort Moore), GA — Army
5. Fort Stewart, GA — Army
6. Joint Base Lewis-McChord, WA — Army/Air Force
7. Fort Bliss, TX — Army
8. Fort Carson, CO — Army
9. Fort Sill, OK — Army
10. Fort Gordon (now Fort Eisenhower), GA — Army
11. Camp Lejeune, NC — Marines
12. Camp Pendleton, CA — Marines
13. Marine Corps Base Quantico, VA — Marines
14. Marine Corps Air Station Miramar, CA — Marines
15. Marine Corps Base Kaneohe Bay, HI — Marines
16. Naval Station Norfolk, VA — Navy (largest in world)
17. Naval Base San Diego, CA — Navy
18. Naval Station Pearl Harbor, HI — Navy
19. Naval Base Kitsap, WA — Navy
20. Naval Air Station Pensacola, FL — Navy
21. NAS Whidbey Island, WA — Navy
22. NAS Jacksonville, FL — Navy
23. Naval Station Mayport, FL — Navy
24. Naval Base Ventura County, CA — Navy
25. Langley AFB (now Joint Base Langley-Eustis), VA — Air Force
26. Wright-Patterson AFB, OH — Air Force
27. Nellis AFB, NV — Air Force
28. Eglin AFB, FL — Air Force
29. Tinker AFB, OK — Air Force
30. Hill AFB, UT — Air Force
31. MacDill AFB, FL — Air Force
32. Barksdale AFB, LA — Air Force
33. Scott AFB, IL — Air Force
34. Peterson SFB, CO — Space Force
35. Schriever SFB, CO — Space Force
36. Los Angeles AFB, CA — Space Force
37. Coast Guard Base Alameda, CA — USCG
38. Coast Guard Base Miami Beach, FL — USCG
39. Coast Guard Base Portsmouth, VA — USCG
40. Pentagon, VA — DoD HQ
41. Fort Meade, MD — NSA/Cyber Command
42. Joint Base Andrews, MD — Air Force/Presidential
43. Joint Base Anacostia-Bolling, DC — Multi
44. Fort McNair, DC — Army
45. Joint Base San Antonio, TX — Multi
46. Joint Base Pearl Harbor-Hickam, HI — Multi
47. Joint Base Elmendorf-Richardson, AK — Multi
48. Kadena AB, Japan — Air Force (overseas)
49. Ramstein AB, Germany — Air Force (overseas)
50. Camp Humphreys, South Korea — Army (overseas)

---

## SECTION 6: PROFESSIONAL ASSOCIATIONS & HONOR SOCIETIES

### 6A. University Professional Organizations

**Business / Finance:**
1. Alpha Kappa Psi (AKPsi) — largest professional business fraternity
2. Delta Sigma Pi (DSP) — co-ed business fraternity
3. Phi Chi Theta — business/economics, co-ed
4. Phi Gamma Nu — women's professional business
5. FBLA (Future Business Leaders of America) — high school + college
6. DECA — collegiate chapter
7. Society for Human Resource Management (SHRM) — student chapter
8. American Marketing Association (AMA) — student chapter
9. Financial Management Association (FMA)

**Finance / Investment:**
10. CFA Society Student Affiliates
11. Financial Planning Association (FPA) — student chapter
12. Investment Banking Club (school-specific, widely common)
13. Rotary Club — campus chapter

**Engineering / STEM:**
14. Tau Beta Pi — engineering honor society (see also 6B)
15. IEEE Student Branch — electrical/computer engineering
16. ASME (American Society of Mechanical Engineers) — student section
17. ASCE (American Society of Civil Engineers) — student chapter
18. AIChE (American Institute of Chemical Engineers) — student chapter
19. Society of Women Engineers (SWE)
20. National Society of Black Engineers (NSBE)
21. Society of Hispanic Professional Engineers (SHPE)
22. ACM (Association for Computing Machinery) — student chapter

**Law / Pre-Law:**
23. Phi Alpha Delta (PAD) — pre-law
24. Pre-Law Society (school-specific, widely common)
25. American Bar Association (ABA) Law Student Division

**Medicine / Health Sciences:**
26. AMSA (American Medical Student Association)
27. AED (Alpha Epsilon Delta) — pre-med honor society
28. SNMA (Student National Medical Association)
29. APhA-ASP (American Pharmacists Association Academy of Student Pharmacists)
30. PNSA (Pre-Nursing Student Association)

**Accounting:**
31. Beta Alpha Psi — accounting/finance honor society
32. IMA (Institute of Management Accountants) — student chapter

**Architecture / Design:**
33. AIA (American Institute of Architects) — student chapter
34. AIGA — design student chapter

**Education:**
35. Student NEA / state education associations

---

### 6B. Honor Societies

**Interdisciplinary / General:**
1. Phi Beta Kappa (PBK) — oldest academic honor society (arts & sciences)
2. Mortar Board — senior honor society
3. Omicron Delta Kappa (ODK) — leadership honor society
4. Golden Key International Honour Society
5. National Society of Collegiate Scholars (NSCS)
6. Phi Kappa Phi — all-discipline honor society

**Greek-Specific:**
7. Order of Omega — Greek honor society
8. Phi Sigma (biological sciences)

**Business:**
9. Beta Gamma Sigma — AACSB-accredited business schools
10. Beta Alpha Psi — accounting/finance

**Engineering:**
11. Tau Beta Pi — engineering
12. Eta Kappa Nu (HKN) — electrical/computer engineering (IEEE honor society)
13. Pi Tau Sigma — mechanical engineering
14. Chi Epsilon — civil engineering
15. Omega Chi Epsilon — chemical engineering
16. Sigma Gamma Tau — aerospace engineering

**Sciences:**
17. Sigma Xi — scientific research
18. Phi Lambda Upsilon — chemistry
19. Gamma Sigma Delta — agriculture
20. Pi Mu Epsilon — mathematics
21. Sigma Pi Sigma — physics

**Social Sciences / Humanities:**
22. Phi Alpha Theta — history
23. Pi Sigma Alpha — political science
24. Psi Chi — psychology
25. Lambda Pi Eta — communication
26. Kappa Tau Alpha — journalism/mass communication
27. Phi Alpha Delta — pre-law
28. Alpha Kappa Delta — sociology
29. Pi Kappa Lambda — music
30. Kappa Delta Pi — education

**Healthcare:**
31. Alpha Epsilon Delta — pre-med
32. Rho Chi — pharmacy
33. Sigma Theta Tau — nursing

**Other:**
34. Alpha Sigma Lambda — non-traditional/adult students
35. Alpha Lambda Delta — freshman academic honor
36. Phi Eta Sigma — freshman honor society

---

## SECTION 7: ORG TYPES (Space Categorization Dropdown)

These are the canonical org type values for the `space_type` field in the DB:

| # | Type Label | Description |
|---|---|---|
| 1 | University / College | 4-year accredited institution |
| 2 | Community College | 2-year institution |
| 3 | High School | Secondary school (public or private) |
| 4 | IFC Fraternity | NIC member fraternity |
| 5 | Panhellenic Sorority | NPC member sorority |
| 6 | NPHC Organization | Divine Nine fraternity or sorority |
| 7 | Multicultural Greek Organization | MGC member organization |
| 8 | Professional Fraternity / Sorority | Business, law, engineering, service, etc. |
| 9 | Local Fraternity / Sorority | Non-affiliated Greek organization |
| 10 | NCAA Athletic Team | Varsity sport at NCAA member school |
| 11 | Club Sport | Recreational/competitive club team |
| 12 | Intramural Sport | Intra-school competition league |
| 13 | Professional Sports Team | NFL/NBA/MLB/NHL/MLS/NWSL or minor league |
| 14 | Military Branch | One of the 6 U.S. military branches |
| 15 | Military Unit / Base | Specific installation, command, or unit |
| 16 | ROTC Program | Army/Navy/Air Force ROTC |
| 17 | Professional Association | Industry org (IEEE, AMA, ABA, etc.) |
| 18 | Honor Society | Academic honor/recognition organization |
| 19 | Business School Club | Org under a business/b-school umbrella |
| 20 | Student Government | SGA or equivalent |
| 21 | Student Organization | General campus club/org (catch-all) |
| 22 | Alumni Association | Formal alumni body of a school/org |
| 23 | Country Club | Private social/athletic club |
| 24 | Athletic / Fitness Program | Gym, CrossFit, league, etc. |
| 25 | Investor / Founder Network | VC network, angel group, founder community |
| 26 | Philanthropic / Advisory Board | Board, foundation, nonprofit advisory |
| 27 | Young Professionals Organization | YPO, Rotary Young Professionals, city-specific |
| 28 | Religious Organization | Campus ministry, faith community, church |
| 29 | Cultural Organization | International/cultural student org |
| 30 | Graduate / Professional School | MBA, law, med, or other grad program |
| 31 | Study Abroad Program | Program or destination-based cohort |
| 32 | Residence Hall / Housing | Dorm, Greek house, living-learning community |
| 33 | Performing Arts | Theater, band, orchestra, dance, choir |
| 34 | Media / Publication | Campus newspaper, magazine, radio, TV |
| 35 | Political Organization | College Dems/Republicans, advocacy groups |
| 36 | Debate / Academic Competition | Mock trial, debate, Model UN |
| 37 | Other | Catch-all for unlisted org types |

---

## APPENDIX: Data Import Sources

| Section | Source | URL |
|---|---|---|
| Universities (all) | College Scorecard API | https://collegescorecard.ed.gov/data/ |
| Universities (D1) | NCAA Schools Directory | https://www.ncaa.org/schools |
| Public High Schools | NCES CCD | https://nces.ed.gov/ccd/ |
| Private High Schools | NCES PSS | https://nces.ed.gov/surveys/pss/ |
| NIC Fraternities | NIC Website | https://www.northamericaninterfraternity.org/ |
| NPC Sororities | NPC Website | https://www.npcwomen.org/ |
| NPHC Orgs | NPHC Website | https://www.nphchq.org/ |
| Sports Teams | SportsDB API | https://www.thesportsdb.com/api.php |
| Military Installations | Military OneSource | https://installations.militaryonesource.mil/ |
| Greek Chapters | Greekrank / OmegaFi | For chapter-level data (school + org combos) |
| NCES Data API | Urban Institute | https://educationdata.urban.org/api/v1/ |

---

*End of Master Reference Dataset. Version 1.0 — 2026-04-22. Compiled by Tony (AI) for Devin (DB import).*