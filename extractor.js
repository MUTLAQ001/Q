javascript:(function() {
    'use strict';
    console.clear();
    console.log("🚀 QU Schedule Extractor v34 (Handles Manual Entry) Initialized...");

    const VIEWER_URL = "https://mutlaq001.github.io/Q/";
    const TEMP_STORAGE_KEY = 'temp_qu_schedule_data';

    /**
     * Parses the raw time string from the university system's hidden inputs.
     * @param {string} detailsRaw - The raw string, e.g., "1 @t 08:00 ص - 09:40 ص @r B-12 @n 3 @t 10:00 ص - 11:40 ص @r C-01"
     * @returns {{timeText: string, location: string}}
     */
    function parseTimeDetails(detailsRaw) {
        if (!detailsRaw || detailsRaw.trim() === '' || detailsRaw.trim() === '--hours--') return { timeText: 'غير محدد', location: 'غير محدد' };
        let loc = 'غير محدد';
        // Extract location first, as it's consistent for the section
        if (detailsRaw.includes('@r')) {
            const locMatch = detailsRaw.match(/@r(.*?)(?:@n|@t|$)/);
            if (locMatch && locMatch[1] && locMatch[1].trim() !== '') loc = locMatch[1].trim();
        }
        // Extract time parts
        if (detailsRaw.includes('@t')) {
            const dayMap = { '1': 'الأحد', '2': 'الاثنين', '3': 'الثلاثاء', '4': 'الأربعاء', '5': 'الخميس', '6': 'الجمعة', '7': 'السبت' };
            const timeParts = detailsRaw.split(/@n\s*/).map(part => {
                const segments = part.split('@t');
                if (segments.length < 2) return null;
                const days = segments[0].trim().split(/\s+/).map(d => dayMap[d] || d).join(' ');
                const timeStr = segments[1].replace(/@r.*$/, '').trim();
                return `${days}: ${timeStr}`;
            }).filter(Boolean);
            const timeText = timeParts.length > 0 ? timeParts.join('<br>') : 'غير محدد';
            return { timeText, location: loc };
        }
        // Fallback for simple text that doesn't match the format
        return { timeText: detailsRaw, location: loc };
    }

    /**
     * Extracts courses from the main list of available sections.
     * @param {HTMLElement[]} rows - The <tr> elements from the main table.
     * @returns {object[]}
     */
    function extractCoursesFromMainList(rows) {
        console.log("Extracting courses from main list...");
        const coursesData = [];
        let lastTheoreticalCourse = null;

        const getVal = (row, th) => {
            // The space in ` ` is a non-breaking space (U+00A0) often found in the portal's HTML.
            let cell = row.querySelector(`td[data-th=" ${th} "]`) || row.querySelector(`td[data-th="${th}"]`);
            return cell ? cell.textContent.trim() : '';
        };

        rows.forEach(row => {
            const code = getVal(row, 'رمز المقرر');
            // The checkbox is a reliable way to get the section number for the main course entry
            const checkbox = row.querySelector("input[type='CHECKBOX']");
            if (!checkbox) return;
            
            // Extract the section from the popup-link which is more reliable.
            const searchLink = row.querySelector("a[id*='_']");
            let section = '';
            if (searchLink && searchLink.onclick) {
                const onclickAttr = searchLink.onclick.toString();
                const sectionMatch = onclickAttr.match(/showToolTip\(this,event,'([^']*)'/);
                if (sectionMatch && sectionMatch[1]) {
                     section = sectionMatch[1].split('-')[0]; // Get the first section number from the list
                }
            }
            if(!section) section = row.querySelector("input[id^='allSection']")?.value.trim() || '';

            const name = getVal(row, 'اسم المقرر');
            
            if (name && code && section) {
                if (lastTheoreticalCourse && code !== lastTheoreticalCourse.code) {
                    lastTheoreticalCourse = null;
                }

                let hours = getVal(row, 'الساعات');
                let type = getVal(row, 'النشاط') || getVal(row, 'نوع المقرر');
                const status = getVal(row, 'الحالة');
                const campus = getVal(row, 'المقر');
                const instructor = row.querySelector('td[name^="instructor"]')?.textContent.trim() || 'غير محدد';
                // The raw time string is in a hidden input
                const detailsRaw = row.querySelector('input[id^="timeSection"]')?.value.trim();
                let examPeriodId = row.querySelector('input[type="hidden"][id$=":examPeriod"]')?.value.trim(); // This selector might need adjustment if not available

                const isPractical = type && (type.includes('عملي') || type.includes('تدريب') || type.includes('تمارين'));
                
                if (isPractical && (!hours || hours.trim() === '0' || hours.trim() === '') && lastTheoreticalCourse && lastTheoreticalCourse.code === code) {
                    hours = lastTheoreticalCourse.hours;
                    examPeriodId = lastTheoreticalCourse.examPeriodId;
                }
                
                const timeDetails = parseTimeDetails(detailsRaw);
                const courseInfo = { code, name, section, time: timeDetails.timeText, location: timeDetails.location, instructor, examPeriodId: examPeriodId || null, hours: hours || '0', type: type || 'نظري', status: status || 'غير معروف', campus: campus || 'غير معروف' };
                coursesData.push(courseInfo);

                if (!isPractical) {
                    lastTheoreticalCourse = { code: courseInfo.code, hours: courseInfo.hours, examPeriodId: examPeriodId };
                }
            }
        });
        return coursesData;
    }

    /**
     * Extracts courses from the "add by section number" input fields.
     * @returns {object[]}
     */
    function extractManuallyAddedCourses() {
        console.log("Extracting manually entered/searched courses...");
        const coursesData = [];

        // Helper to parse the HTML table generated inside the time divs
        function parseTimeAndLocationFromDiv(timeDiv) {
            if (!timeDiv) return { timeText: 'غير محدد', location: 'غير محدد' };
            const timeRows = timeDiv.querySelectorAll('table tr');
            let timeParts = [];
            let location = 'غير محدد';

            if (timeRows.length > 0) {
                const hasHeader = timeRows[0].classList.contains('tableHeader') || timeRows[0].querySelector('.HEADING');
                for (let i = (hasHeader ? 1 : 0); i < timeRows.length; i++) {
                    const cells = timeRows[i].querySelectorAll('td');
                    if (cells.length >= 2) {
                        const day = cells[0].textContent.trim();
                        const time = cells[1].textContent.trim();
                        if (day && time) {
                            timeParts.push(`${day}: ${time}`);
                        }
                        if (cells.length >= 3 && cells[2].textContent.trim()) {
                            location = cells[2].textContent.trim();
                        }
                    }
                }
            }
            const timeText = timeParts.length > 0 ? timeParts.join('<br>') : 'غير محدد';
            // If the table parsing failed but there's text, use it as fallback
            if (timeText === 'غير محدد' && timeDiv.textContent.trim()) {
                return parseTimeDetails(timeDiv.textContent.trim());
            }
            return { timeText, location };
        }

        function processRows(prefix, isFreeCourse) {
            for (let i = 0; i < 25; i++) { // System has up to 25 rows for manual entry
                const inputEl = document.getElementById(`${prefix}Section${i}`);
                if (!inputEl || !inputEl.value.trim()) continue;

                const section = inputEl.value.trim();
                const codeEl = document.getElementById(`${prefix}CourseCode${i}`);
                const code = codeEl ? codeEl.textContent.trim() : '';
                
                if (!code) continue; // Skip if AJAX hasn't populated the details

                const name = document.getElementById(`${prefix}CourseName${i}`)?.textContent.trim() || 'غير محدد';
                const campus = document.getElementById(`${prefix}CampusName${i}`)?.textContent.trim() || 'غير معروف';
                const instructor = document.getElementById(`${prefix}Instructor${i}`)?.textContent.trim() || 'غير محدد';
                const hours = document.getElementById(`${prefix}ActivityCode${i}`)?.textContent.trim() || '0';
                const timeDiv = document.getElementById(`${prefix}Time${i}`);
                const timeDetails = parseTimeAndLocationFromDiv(timeDiv);
                
                let type;
                if (isFreeCourse) {
                    type = 'حرة';
                } else {
                    // For regular courses, type is in 'groupTypeDesc' or fallback to 'نوع المقرر' column header
                    type = document.getElementById(`groupTypeDesc${i}`)?.textContent.trim() || 'نظري';
                }

                coursesData.push({
                    code, name, section, instructor, hours, campus,
                    time: timeDetails.timeText,
                    location: timeDetails.location,
                    type,
                    examPeriodId: null, // Not available in this view
                    status: 'مفتوحة', // Assume open since it was added manually
                });
            }
        }

        processRows('add', false); // Regular courses entered by section number
        processRows('free', true); // Free electives entered by section number
        return coursesData;
    }

    // --- Main Execution Block ---
    setTimeout(() => {
        // Use a precise selector for the main course list rows
        const mainCourseTableRows = Array.from(document.querySelectorAll('td.HEADING_CHECK')).map(td => td.parentElement);
        
        const mainCourses = extractCoursesFromMainList(mainCourseTableRows);
        const manualCourses = extractManuallyAddedCourses();
        const allCourses = [...mainCourses, ...manualCourses];

        // Remove duplicates in case a course was added manually and also exists in the list
        const uniqueCourses = allCourses.filter((course, index, self) =>
            index === self.findIndex((c) => c.code === course.code && c.section === course.section)
        );

        if (uniqueCourses.length === 0) {
            alert("فشل استخراج البيانات.\n\nلم يتم العثور على أي مقررات.\n\nتأكد من أن المواد ظاهرة في القائمة أو مدخلة في حقول 'أدخل الشعبة' قبل تشغيل الأداة.");
            return;
        }
        
        console.log(`🎉 Success! Found ${uniqueCourses.length} unique sections.`);
        sessionStorage.setItem(TEMP_STORAGE_KEY, JSON.stringify(uniqueCourses));
        const viewerWindow = window.open(VIEWER_URL, 'QU_Schedule_Viewer');

        if (!viewerWindow || viewerWindow.closed || typeof viewerWindow.closed === 'undefined') {
            alert("فشل فتح نافذة العارض.\n\nالرجاء السماح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع والمحاولة مرة أخرى.");
            sessionStorage.removeItem(TEMP_STORAGE_KEY);
            return;
        }

        const messageHandler = (event) => {
            if (event.source === viewerWindow && event.data === 'request_schedule_data') {
                const storedData = sessionStorage.getItem(TEMP_STORAGE_KEY);
                if (storedData) {
                    viewerWindow.postMessage({ type: 'universityCoursesData', data: JSON.parse(storedData) }, new URL(VIEWER_URL).origin);
                    sessionStorage.removeItem(TEMP_STORAGE_KEY);
                    window.removeEventListener('message', messageHandler);
                }
            }
        };
        window.addEventListener('message', messageHandler, false);

    }, 500);
})();
