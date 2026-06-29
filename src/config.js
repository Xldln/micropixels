
const API_BASE = import.meta.env.DEV
  ? 'http://localhost:9000/micropixels'       
  : 'https://api.yourdomain.com/micropixels'  

export default API_BASE