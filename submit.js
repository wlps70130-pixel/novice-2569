export interface Env {
  PDF_BUCKET: R2Bucket;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_GROUP_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Handle POST request (ฟอร์ม submit)
    if (request.method === 'POST') {
      try {
        // 1. รับข้อมูลจากฟอร์ม (เป็น FormData หรือ JSON)
        let formData: FormData;
        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          // กรณีส่งเป็น JSON (จากโค้ดเดิมของคุณ)
          const jsonData = await request.json();
          formData = new FormData();
          for (const [key, value] of Object.entries(jsonData)) {
            if (value !== null && value !== undefined) {
              formData.append(key, String(value));
            }
          }
        } else {
          // กรณีส่งเป็น FormData
          formData = await request.formData();
        }
        
        // 2. สร้างเลขที่ใบสมัคร (ถ้าไม่มี)
        let applicationNo = formData.get('application_no') as string;
        if (!applicationNo) {
          applicationNo = `NO-${Date.now().toString().slice(-6)}`;
          formData.append('application_no', applicationNo);
        }
        
        // 3. สร้าง PDF
        const pdfBlob = await generatePDF(formData);
        
        // 4. อัปโหลด PDF ขึ้น R2
        const fileName = `applications/${applicationNo}_${Date.now()}.pdf`;
        await env.PDF_BUCKET.put(fileName, pdfBlob, {
          httpMeta {
            contentType: 'application/pdf',
          },
        });
        
        // 5. สร้าง Public URL
        const publicUrl = `https://pub-27f457677ea3ad9b71c9155059b8fa1f.r2.dev/${fileName}`;
        
        // 6. ส่งแจ้งเตือนผ่าน LINE
        await sendLINEMessage(formData, publicUrl, env);
        
        // 7. ตอบกลับสำเร็จ
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'บันทึกข้อมูลและส่งแจ้งเตือนเรียบร้อยแล้ว',
          application_no: applicationNo,
          pdfUrl: publicUrl
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('❌ Error:', error);
        return new Response(JSON.stringify({ 
          success: false,
          error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle GET request (ทดสอบ)
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ 
        status: 'Worker is running!',
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    });
  }
};

// 📄 ฟังก์ชันสร้าง PDF
async function generatePDF(formData: FormData): Promise<Blob> {
  const name = formData.get('name') || '';
  const surname = formData.get('surname') || '';
  const applicationNo = formData.get('application_no') || 'N/A';
  
  const content = `
================================
    ใบสมัครเข้าร่วมกิจกรรม
    Summer Novice Camp 2569
================================

เลขที่ใบสมัคร: ${applicationNo}
วันที่สมัคร: ${new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour12: false
  })}

--------------------------------
ข้อมูลผู้สมัคร
--------------------------------
ชื่อ-นามสกุล: ${name} ${surname}
เลขบัตรประชาชน: ${formData.get('id_card') || '-'}
วันเกิด: ${formData.get('birth_date') || '-'}
อายุ: ${formData.get('age') || '-'} ปี
หมู่เลือด: ${formData.get('blood_type') || '-'}

ที่อยู่: ${formData.get('address') || '-'}
        ${formData.get('district') || ''} 
        ${formData.get('province') || ''} 
        ${formData.get('postal_code') || ''}

เบอร์โทร: ${formData.get('phone') || '-'}
LINE ID: ${formData.get('line_id') || '-'}
อีเมล: ${formData.get('email') || '-'}

--------------------------------
ข้อมูลผู้ปกครอง
--------------------------------
ชื่อ-นามสกุล: ${formData.get('parent_name') || '-'}
ความสัมพันธ์: ${formData.get('parent_relation') || '-'}
เบอร์โทร: ${formData.get('parent_phone') || '-'}
LINE ID: ${formData.get('parent_line') || '-'}

--------------------------------
ข้อมูลสุขภาพ
--------------------------------
น้ำหนัก: ${formData.get('weight') || '-'} กก.
ส่วนสูง: ${formData.get('height') || '-'} ซม.
โรคประจำตัว: ${formData.get('disease') || 'ไม่มี'}
อาการแพ้: ${formData.get('allergy') || 'ไม่มี'}

================================
ลงชื่อ _________________________
        (ผู้สมัคร)

ลงชื่อ _________________________
        (ผู้ปกครอง)
================================
`;

  return new Blob([content], { type: 'application/pdf' });
}

// 💬 ฟังก์ชันส่ง LINE Flex Message
async function sendLINEMessage(
  formData: FormData,
  pdfUrl: string,
  env: Env
): Promise<void> {
  const name = formData.get('name') || '';
  const surname = formData.get('surname') || '';
  const applicationNo = formData.get('application_no') || '';
  const phone = formData.get('phone') || '';
  
  const flexMessage = {
    type: 'flex',
    altText: `ใบสมัครใหม่: ${applicationNo}`,
    contents: {
      type: 'bubble',
      theme: 'default',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#20c997',
        paddingAll: '12px',
        contents: [
          {
            type: 'text',
            text: '📄 ใบสมัครใหม่',
            color: '#ffffff',
            weight: 'bold',
            size: 'lg',
            align: 'center'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: `เลขที่: ${applicationNo}`,
                weight: 'bold',
                color: '#1a1a1a',
                size: 'md'
              },
              {
                type: 'text',
                text: `ชื่อ: ${name} ${surname}`,
                wrap: true,
                color: '#666666'
              },
              {
                type: 'text',
                text: `เบอร์โทร: ${phone}`,
                wrap: true,
                color: '#666666'
              }
            ]
          },
          {
            type: 'separator'
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: '📥 ดาวน์โหลดใบสมัคร',
                weight: 'bold',
                color: '#1a1a1a'
              },
              {
                type: 'text',
                text: 'กดปุ่มด้านล่างเพื่อเปิดไฟล์ PDF',
                wrap: true,
                size: 'sm',
                color: '#999999'
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#20c997',
            action: {
              type: 'uri',
              label: '📥 ดาวน์โหลด PDF',
              uri: pdfUrl
            }
          }
        ],
        paddingAll: '12px'
      }
    } as any
  };

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: env.LINE_GROUP_ID,
      messages: [flexMessage]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API Error: ${response.status} - ${errorText}`);
  }
}
